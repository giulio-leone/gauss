// =============================================================================
// AgentSupervisor — Erlang-style OTP supervisor for GaussFlow
// =============================================================================

import type { AgentEventType } from "../types.js";
import { EventBus } from "../agent/event-bus.js";
import { AgentNode } from "./agent-node.js";

// =============================================================================
// Public Types
// =============================================================================

export type SupervisorStrategy = "one-for-one" | "one-for-all" | "rest-for-one";
export type ChildPolicy = "permanent" | "temporary" | "transient";

export interface RestartIntensity {
  /** Maximum number of restarts allowed within the windowMs period. */
  maxRestarts: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
}

export interface ChildSpec {
  id: string;
  policy: ChildPolicy;
  factory: () => Promise<AgentNode>;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  /** Called when intensity is exceeded and no parent supervisor is available. */
  degradedFallback?: () => Promise<string>;
}

export interface SupervisorConfig {
  id: string;
  strategy: SupervisorStrategy;
  intensity: RestartIntensity;
  children: ChildSpec[];
  eventBus?: EventBus;
  parentSupervisor?: AgentSupervisor;
  shutdownTimeoutMs?: number;
}

export type ChildStatus = "running" | "stopped" | "crashed" | "restarting";

// =============================================================================
// Internal state per child
// =============================================================================

interface ChildState {
  spec: ChildSpec;
  node: AgentNode | null;
  status: ChildStatus;
  /** Timestamps of restarts within the sliding window. */
  restartTimestamps: number[];
  heartbeatTimer: ReturnType<typeof setInterval> | null;
}

// =============================================================================
// AgentSupervisor
// =============================================================================

export class AgentSupervisor {
  private readonly id: string;
  private readonly strategy: SupervisorStrategy;
  private readonly intensity: RestartIntensity;
  private readonly childSpecs: ChildSpec[];
  private readonly eventBus: EventBus | undefined;
  private readonly parentSupervisor: AgentSupervisor | undefined;
  private readonly shutdownTimeoutMs: number;

  private readonly children = new Map<string, ChildState>();

  constructor(config: SupervisorConfig) {
    this.id = config.id;
    this.strategy = config.strategy;
    this.intensity = config.intensity;
    this.childSpecs = config.children;
    this.eventBus = config.eventBus;
    this.parentSupervisor = config.parentSupervisor;
    this.shutdownTimeoutMs = config.shutdownTimeoutMs ?? 5000;
  }

  /** Start all children in declaration order. */
  async start(): Promise<void> {
    this.emit("supervisor:start", { supervisorId: this.id });
    for (const spec of this.childSpecs) {
      await this.startChild(spec);
    }
  }

  /**
   * Entry point for crash recovery.
   * Checks policy, restart intensity, applies strategy.
   */
  async handleChildCrash(childId: string, error: Error): Promise<void> {
    const state = this.children.get(childId);
    if (!state) return;

    // Guard against concurrent/duplicate crash handling
    if (state.status === "crashed" || state.status === "restarting") return;

    state.status = "crashed";
    this.clearHeartbeat(state);
    this.emit("supervisor:child-crashed", { supervisorId: this.id, childId, error: error.message });

    const { policy } = state.spec;

    // temporary: never restart
    if (policy === "temporary") {
      state.status = "stopped";
      this.emit("supervisor:child-stopped", { supervisorId: this.id, childId, reason: "temporary" });
      return;
    }

    // Check restart intensity (sliding window)
    const now = Date.now();
    state.restartTimestamps = state.restartTimestamps.filter(
      (ts) => now - ts < this.intensity.windowMs,
    );

    if (state.restartTimestamps.length >= this.intensity.maxRestarts) {
      this.emit("supervisor:intensity-exceeded", { supervisorId: this.id, childId });

      if (this.parentSupervisor) {
        await this.parentSupervisor.handleChildCrash(
          this.id,
          new Error(`Child supervisor "${this.id}" exceeded restart intensity for child "${childId}"`),
        );
      } else if (state.spec.degradedFallback) {
        try {
          await state.spec.degradedFallback();
        } catch {
          // ignore fallback errors
        }
        state.status = "stopped";
      } else {
        state.status = "stopped";
      }
      return;
    }

    state.restartTimestamps.push(now);

    switch (this.strategy) {
      case "one-for-one":
        await this.restartChild(childId);
        break;
      case "one-for-all":
        await this.restartAll();
        break;
      case "rest-for-one":
        await this.restartRestForOne(childId);
        break;
    }
  }

  /** Graceful shutdown: stop children in reverse declaration order. */
  async shutdown(): Promise<void> {
    this.emit("supervisor:stop", { supervisorId: this.id });
    const reversed = [...this.childSpecs].reverse();
    for (const spec of reversed) {
      const state = this.children.get(spec.id);
      if (!state) continue;
      this.clearHeartbeat(state);
      state.status = "stopped";
      state.node = null;
    }
  }

  /** Return the status of a single child, or undefined if unknown. */
  getChildState(id: string): ChildStatus | undefined {
    return this.children.get(id)?.status;
  }

  /** Return a status map for all children. */
  getChildrenStatus(): Record<string, ChildStatus> {
    const result: Record<string, ChildStatus> = {};
    for (const [id, state] of this.children) {
      result[id] = state.status;
    }
    return result;
  }

  /** Return the live AgentNode for a running child, or null. */
  getLiveNode(id: string): AgentNode | null {
    const state = this.children.get(id);
    return state?.status === "running" ? (state.node ?? null) : null;
  }

  // ===========================================================================
  // Internal helpers
  // ===========================================================================

  private async startChild(spec: ChildSpec): Promise<void> {
    let state = this.children.get(spec.id);
    if (!state) {
      state = {
        spec,
        node: null,
        status: "stopped",
        restartTimestamps: [],
        heartbeatTimer: null,
      };
      this.children.set(spec.id, state);
    }

    state.status = "restarting";
    try {
      const node = await spec.factory();
      state.node = node;
      state.status = "running";
      this.emit("supervisor:child-started", { supervisorId: this.id, childId: spec.id });
    } catch (err) {
      state.status = "crashed";
      this.emit("supervisor:child-crashed", {
        supervisorId: this.id,
        childId: spec.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    if (spec.heartbeatIntervalMs) {
      this.scheduleHeartbeat(spec.id, spec.heartbeatIntervalMs, spec.heartbeatTimeoutMs ?? 5000);
    }
  }

  private async restartChild(childId: string): Promise<void> {
    const state = this.children.get(childId);
    if (!state) return;

    state.status = "restarting";
    try {
      const node = await state.spec.factory();
      state.node = node;
      state.status = "running";
      this.emit("supervisor:child-restarted", { supervisorId: this.id, childId });
    } catch (err) {
      state.status = "crashed";
      this.emit("supervisor:child-crashed", {
        supervisorId: this.id,
        childId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    if (state.spec.heartbeatIntervalMs) {
      this.scheduleHeartbeat(
        childId,
        state.spec.heartbeatIntervalMs,
        state.spec.heartbeatTimeoutMs ?? 5000,
      );
    }
  }

  private async restartAll(): Promise<void> {
    // Stop all heartbeats and mark as stopped
    for (const state of this.children.values()) {
      this.clearHeartbeat(state);
      state.status = "stopped";
      state.node = null;
    }
    // Restart in declaration order, continue on individual failures
    for (const spec of this.childSpecs) {
      try {
        await this.restartChild(spec.id);
      } catch {
        // Factory failure already handled inside restartChild (status set to crashed)
      }
    }
  }

  private async restartRestForOne(crashedId: string): Promise<void> {
    const crashedIndex = this.childSpecs.findIndex((s) => s.id === crashedId);
    if (crashedIndex === -1) return;

    // Stop the crashed child and all subsequent children
    const toRestart = this.childSpecs.slice(crashedIndex);
    for (const spec of toRestart) {
      const state = this.children.get(spec.id);
      if (state) {
        this.clearHeartbeat(state);
        state.status = "stopped";
        state.node = null;
      }
    }

    // Restart in order, continue on individual failures
    for (const spec of toRestart) {
      try {
        await this.restartChild(spec.id);
      } catch {
        // Factory failure already handled inside restartChild (status set to crashed)
      }
    }
  }

  private scheduleHeartbeat(childId: string, intervalMs: number, timeoutMs: number): void {
    const state = this.children.get(childId);
    if (!state) return;

    this.clearHeartbeat(state);

    state.heartbeatTimer = setInterval(async () => {
      const current = this.children.get(childId);
      if (!current || current.status !== "running") return;

      const node = current.node;
      if (!node || typeof (node as unknown as Record<string, unknown>)["ping"] !== "function") return;

      try {
        const ping = (node as unknown as Record<string, unknown>)["ping"] as () => Promise<void>;
        await Promise.race([
          ping(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Heartbeat timeout for child "${childId}"`)),
              timeoutMs,
            ),
          ),
        ]);
      } catch (err) {
        this.handleChildCrash(
          childId,
          err instanceof Error ? err : new Error(String(err)),
        ).catch(() => { /* crash handler errors are emitted as events */ });
      }
    }, intervalMs);
  }

  private clearHeartbeat(state: ChildState): void {
    if (state.heartbeatTimer !== null) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
  }

  private emit(type: string, data?: unknown): void {
    this.eventBus?.emit(type as AgentEventType, data);
  }
}
