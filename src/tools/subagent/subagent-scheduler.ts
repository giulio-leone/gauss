// =============================================================================
// SubagentScheduler — Pool sizing + priority queue + circuit breaker
// =============================================================================

import { generateText, streamText, stepCountIs } from "../../core/llm/index.js";
import type { LanguageModel } from "../../core/llm/index.js";

import type { TelemetryPort } from "../../ports/telemetry.port.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import { createFilesystemTools } from "../filesystem/index.js";
import type {
  SubagentHandle,
  SubagentResourceLimits,
} from "./subagent-registry.js";
import { SubagentRegistry } from "./subagent-registry.js";

// ---------------------------------------------------------------------------
// Pool Config
// ---------------------------------------------------------------------------

export interface PoolConfig {
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  resizeCooldownMs: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  minWorkers: 2,
  maxWorkers: 20,
  scaleUpThreshold: 0.8,
  scaleDownThreshold: 0.3,
  resizeCooldownMs: 10_000,
};

// ---------------------------------------------------------------------------
// Priority Queue (binary min-heap with aging)
// ---------------------------------------------------------------------------

interface QueueEntry {
  handle: SubagentHandle;
  effectivePriority: number;
  enqueuedAt: number;
}

export class PriorityQueue {
  private heap: QueueEntry[] = [];
  private readonly agingIntervalMs: number;

  constructor(agingIntervalMs = 5_000) {
    this.agingIntervalMs = agingIntervalMs;
  }

  get size(): number {
    return this.heap.length;
  }

  enqueue(handle: SubagentHandle): void {
    const entry: QueueEntry = {
      handle,
      effectivePriority: handle.priority,
      enqueuedAt: Date.now(),
    };
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): SubagentHandle | null {
    if (this.heap.length === 0) return null;
    this.refreshPriorities();

    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top.handle;
  }

  peek(): SubagentHandle | null {
    return this.heap.length > 0 ? this.heap[0]!.handle : null;
  }

  remove(taskId: string): boolean {
    const idx = this.heap.findIndex((e) => e.handle.taskId === taskId);
    if (idx === -1) return false;
    const last = this.heap.pop()!;
    if (idx < this.heap.length) {
      this.heap[idx] = last;
      this.bubbleUp(idx);
      this.sinkDown(idx);
    }
    return true;
  }

  private refreshPriorities(): void {
    const now = Date.now();
    let dirty = false;
    for (const entry of this.heap) {
      const ageBonus = Math.floor(
        (now - entry.enqueuedAt) / this.agingIntervalMs,
      );
      const newPriority = Math.max(1, entry.handle.priority - ageBonus);
      if (newPriority !== entry.effectivePriority) {
        entry.effectivePriority = newPriority;
        dirty = true;
      }
    }
    if (dirty) {
      // Rebuild heap
      for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
        this.sinkDown(i);
      }
    }
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (
        this.heap[parentIdx]!.effectivePriority <=
        this.heap[idx]!.effectivePriority
      )
        break;
      [this.heap[parentIdx]!, this.heap[idx]!] = [
        this.heap[idx]!,
        this.heap[parentIdx]!,
      ];
      idx = parentIdx;
    }
  }

  private sinkDown(idx: number): void {
    const length = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (
        left < length &&
        this.heap[left]!.effectivePriority <
          this.heap[smallest]!.effectivePriority
      ) {
        smallest = left;
      }
      if (
        right < length &&
        this.heap[right]!.effectivePriority <
          this.heap[smallest]!.effectivePriority
      ) {
        smallest = right;
      }
      if (smallest === idx) break;
      [this.heap[smallest]!, this.heap[idx]!] = [
        this.heap[idx]!,
        this.heap[smallest]!,
      ];
      idx = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker state per task type
// ---------------------------------------------------------------------------

interface TaskTypeCircuitState {
  failures: number[];
  state: "closed" | "open" | "half-open";
  lastFailure: number;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class SubagentScheduler {
  private readonly registry: SubagentRegistry;
  private readonly queue: PriorityQueue;
  private readonly poolConfig: PoolConfig;
  private readonly model: LanguageModel;
  private readonly limits: SubagentResourceLimits;
  private readonly telemetry?: TelemetryPort;

  private currentPoolSize: number;
  private activeWorkers = 0;
  private lastResizeAt = 0;
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  private readonly circuitBreakers = new Map<string, TaskTypeCircuitState>();
  private readonly cbConfig = {
    failureThreshold: 3,
    monitorWindowMs: 60_000,
    resetTimeoutMs: 30_000,
  };

  constructor(
    registry: SubagentRegistry,
    model: LanguageModel,
    limits: SubagentResourceLimits,
    options?: {
      poolConfig?: Partial<PoolConfig>;
      telemetry?: TelemetryPort;
    },
  ) {
    this.registry = registry;
    this.model = model;
    this.limits = limits;
    this.poolConfig = { ...DEFAULT_POOL_CONFIG, ...options?.poolConfig };
    this.telemetry = options?.telemetry;
    this.queue = new PriorityQueue();
    this.currentPoolSize = this.poolConfig.minWorkers;

    registry.setScheduler(this);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    this.drainTimer = setInterval(() => this.drain(), 100);
  }

  async shutdown(): Promise<void> {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Enqueue (called by registry on dispatch)
  // -------------------------------------------------------------------------

  enqueue(handle: SubagentHandle): void {
    this.queue.enqueue(handle);
    this.drain();
  }

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  getMetrics(): {
    activeWorkers: number;
    poolSize: number;
    queueSize: number;
  } {
    return {
      activeWorkers: this.activeWorkers,
      poolSize: this.currentPoolSize,
      queueSize: this.queue.size,
    };
  }

  // -------------------------------------------------------------------------
  // Drain loop
  // -------------------------------------------------------------------------

  drain(): void {
    while (
      this.queue.size > 0 &&
      this.activeWorkers < this.currentPoolSize
    ) {
      const handle = this.queue.dequeue();
      if (!handle) break;

      if (handle.abortController.signal.aborted) {
        this.registry.transition(handle.taskId, "cancelled", {
          error: "cancelled-while-queued",
        });
        continue;
      }

      const taskType = this.getTaskType(handle);
      if (this.isCircuitOpen(taskType)) {
        this.registry.transition(handle.taskId, "failed", {
          error:
            "Circuit breaker open for this task type. Too many recent failures.",
        });
        continue;
      }

      this.activeWorkers++;
      this.executeHandle(handle).finally(() => {
        this.activeWorkers--;
        this.maybeResize();
        this.drain();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Execute a single handle
  // -------------------------------------------------------------------------

  private async executeHandle(handle: SubagentHandle): Promise<void> {
    this.registry.transition(handle.taskId, "running");

    const subVfs = new VirtualFilesystem();
    const fsTools = createFilesystemTools(subVfs);

    handle.timeoutTimer = setTimeout(() => {
      handle.abortController.abort("timeout");
      this.registry.transition(handle.taskId, "timeout", {
        error: `Subagent timed out after ${handle.timeoutMs}ms`,
      });
    }, handle.timeoutMs);

    try {
      const result = await generateText({
        model: this.model,
        system:
          handle.instructions ??
          "You are a specialized subagent. Complete the task and return your findings.",
        tools: { ...fsTools },
        stopWhen: stepCountIs(this.limits.maxStepsPerSubagent),
        prompt: handle.prompt,
        abortSignal: handle.abortController.signal,
      });

      const output =
        result.text || "[Subagent completed with no text output]";

      const usage = (result as any).usage;
      if (usage) {
        handle.tokenUsage.input += usage.inputTokens ?? 0;
        handle.tokenUsage.output += usage.outputTokens ?? 0;
      }

      this.registry.transition(handle.taskId, "completed", {
        finalOutput: output,
      });
      this.recordSuccess(this.getTaskType(handle));
    } catch (error: unknown) {
      if (handle.abortController.signal.aborted) return;

      const message =
        error instanceof Error ? error.message : String(error);
      this.registry.transition(handle.taskId, "failed", {
        error: message,
      });
      this.recordFailure(this.getTaskType(handle));
    }
  }

  // -------------------------------------------------------------------------
  // Pool Sizing
  // -------------------------------------------------------------------------

  private maybeResize(): void {
    const now = Date.now();
    if (now - this.lastResizeAt < this.poolConfig.resizeCooldownMs) return;

    const utilization =
      this.currentPoolSize > 0
        ? this.activeWorkers / this.currentPoolSize
        : 0;

    let newSize = this.currentPoolSize;
    if (utilization > this.poolConfig.scaleUpThreshold) {
      newSize = Math.min(
        Math.ceil(this.currentPoolSize * 1.5),
        this.poolConfig.maxWorkers,
      );
    } else if (utilization < this.poolConfig.scaleDownThreshold) {
      newSize = Math.max(
        Math.floor(this.currentPoolSize * 0.75),
        this.poolConfig.minWorkers,
      );
    }

    if (newSize !== this.currentPoolSize) {
      this.currentPoolSize = newSize;
      this.lastResizeAt = now;
      this.telemetry?.recordMetric("subagent.pool.size", newSize);
    }
    this.telemetry?.recordMetric(
      "subagent.pool.utilization",
      utilization,
    );
  }

  // -------------------------------------------------------------------------
  // Circuit Breaker per task type
  // -------------------------------------------------------------------------

  private getTaskType(handle: SubagentHandle): string {
    return handle.instructions ?? "__default__";
  }

  private isCircuitOpen(taskType: string): boolean {
    const state = this.circuitBreakers.get(taskType);
    if (!state) return false;
    if (state.state === "open") {
      if (
        Date.now() - state.lastFailure >
        this.cbConfig.resetTimeoutMs
      ) {
        state.state = "half-open";
        return false;
      }
      return true;
    }
    return false;
  }

  private recordFailure(taskType: string): void {
    const now = Date.now();
    let state = this.circuitBreakers.get(taskType);
    if (!state) {
      state = { failures: [], state: "closed", lastFailure: 0 };
      this.circuitBreakers.set(taskType, state);
    }
    state.failures.push(now);
    state.lastFailure = now;
    state.failures = state.failures.filter(
      (t) => now - t < this.cbConfig.monitorWindowMs,
    );

    if (state.failures.length >= this.cbConfig.failureThreshold) {
      state.state = "open";
      this.telemetry?.recordMetric(
        "subagent.circuit_breaker.open",
        1,
      );
    }
  }

  private recordSuccess(taskType: string): void {
    const state = this.circuitBreakers.get(taskType);
    if (state?.state === "half-open") {
      state.state = "closed";
      state.failures = [];
    }
  }
}
