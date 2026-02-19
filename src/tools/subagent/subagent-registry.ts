// =============================================================================
// SubagentRegistry — Lifecycle manager for async subagent handles
// =============================================================================

import type { EventBus } from "../../agent/event-bus.js";
import type { TelemetryPort } from "../../ports/telemetry.port.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubagentTaskStatus =
  | "queued"
  | "running"
  | "streaming"
  | "completed"
  | "failed"
  | "timeout"
  | "cancelled";

const TERMINAL_STATES: ReadonlySet<SubagentTaskStatus> = new Set([
  "completed",
  "failed",
  "timeout",
  "cancelled",
]);

/** Valid transitions map: from → Set<to> */
const VALID_TRANSITIONS = new Map<SubagentTaskStatus, ReadonlySet<SubagentTaskStatus>>([
  ["queued", new Set(["running", "cancelled"])],
  ["running", new Set(["streaming", "completed", "failed", "timeout", "cancelled"])],
  ["streaming", new Set(["completed", "failed", "timeout", "cancelled"])],
  ["completed", new Set()],
  ["failed", new Set()],
  ["timeout", new Set()],
  ["cancelled", new Set()],
]);

export interface SubagentHandle {
  readonly taskId: string;
  readonly parentId: string;
  readonly depth: number;
  readonly createdAt: number;
  status: SubagentTaskStatus;
  statusChangedAt: number;
  priority: number;
  partialOutput: string;
  finalOutput: string | null;
  error: string | null;
  readonly abortController: AbortController;
  readonly prompt: string;
  readonly instructions: string | null;
  readonly timeoutMs: number;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  tokenUsage: { input: number; output: number };
  readonly metadata: Record<string, unknown>;
}

export interface SubagentResourceLimits {
  maxConcurrentPerParent: number;
  maxConcurrentGlobal: number;
  maxDepth: number;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  maxQueueSize: number;
  gcTtlMs: number;
  gcIntervalMs: number;
  maxStepsPerSubagent: number;
}

export interface DispatchParams {
  prompt: string;
  instructions?: string;
  priority?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export const DEFAULT_LIMITS: SubagentResourceLimits = {
  maxConcurrentPerParent: 5,
  maxConcurrentGlobal: 50,
  maxDepth: 3,
  defaultTimeoutMs: 300_000,
  maxTimeoutMs: 600_000,
  maxQueueSize: 100,
  gcTtlMs: 60_000,
  gcIntervalMs: 30_000,
  maxStepsPerSubagent: 20,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SubagentQueueFullError extends Error {
  constructor(queueSize: number, maxSize: number) {
    super(
      `Subagent queue is full (${queueSize}/${maxSize}). ` +
        `Try again after some tasks complete.`,
    );
    this.name = "SubagentQueueFullError";
  }
}

export class SubagentDepthExceededError extends Error {
  constructor(currentDepth: number, maxDepth: number) {
    super(
      `Maximum subagent nesting depth exceeded (${currentDepth}/${maxDepth}).`,
    );
    this.name = "SubagentDepthExceededError";
  }
}

export class SubagentQuotaExceededError extends Error {
  constructor(parentId: string, reason: string) {
    super(`Quota exceeded for parent "${parentId}": ${reason}`);
    this.name = "SubagentQuotaExceededError";
  }
}

// ---------------------------------------------------------------------------
// Forward declaration for bidirectional reference
// ---------------------------------------------------------------------------

interface Schedulable {
  enqueue(handle: SubagentHandle): void;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class SubagentRegistry {
  private readonly handles = new Map<string, SubagentHandle>();
  private readonly parentIndex = new Map<string, Set<string>>();
  private readonly limits: SubagentResourceLimits;
  private readonly eventBus: EventBus;
  private readonly telemetry?: TelemetryPort;
  private readonly generateId: () => string;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  /** Listeners waiting for a specific task to reach terminal state */
  private readonly completionListeners = new Map<
    string,
    Array<(handle: SubagentHandle) => void>
  >();

  /** Scheduler reference — set via setScheduler() after construction */
  private scheduler: Schedulable | null = null;

  constructor(
    eventBus: EventBus,
    options?: {
      limits?: Partial<SubagentResourceLimits>;
      telemetry?: TelemetryPort;
      generateId?: () => string;
    },
  ) {
    this.eventBus = eventBus;
    this.limits = { ...DEFAULT_LIMITS, ...options?.limits };
    this.telemetry = options?.telemetry;
    this.generateId = options?.generateId ?? (() => crypto.randomUUID());
  }

  /** Wire the scheduler (called during setup) */
  setScheduler(scheduler: Schedulable): void {
    this.scheduler = scheduler;
  }

  get resourceLimits(): Readonly<SubagentResourceLimits> {
    return this.limits;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    this.gcTimer = setInterval(() => this.gc(), this.limits.gcIntervalMs);
  }

  async shutdown(): Promise<void> {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    for (const handle of this.handles.values()) {
      if (!TERMINAL_STATES.has(handle.status)) {
        this.cancel(handle.taskId, "registry-shutdown");
      }
    }
    this.handles.clear();
    this.parentIndex.clear();
    this.completionListeners.clear();
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  dispatch(
    parentId: string,
    currentDepth: number,
    params: DispatchParams,
  ): SubagentHandle {
    if (currentDepth >= this.limits.maxDepth) {
      throw new SubagentDepthExceededError(currentDepth, this.limits.maxDepth);
    }

    const parentHandles = this.parentIndex.get(parentId);
    const parentActive = parentHandles
      ? [...parentHandles].filter((id) => {
          const h = this.handles.get(id);
          return h && !TERMINAL_STATES.has(h.status);
        }).length
      : 0;

    if (parentActive >= this.limits.maxConcurrentPerParent) {
      throw new SubagentQuotaExceededError(
        parentId,
        `max concurrent per parent (${this.limits.maxConcurrentPerParent}) reached`,
      );
    }

    const queuedCount = [...this.handles.values()].filter(
      (h) => h.status === "queued",
    ).length;

    if (queuedCount >= this.limits.maxQueueSize) {
      throw new SubagentQueueFullError(queuedCount, this.limits.maxQueueSize);
    }

    const timeoutMs = Math.min(
      params.timeoutMs ?? this.limits.defaultTimeoutMs,
      this.limits.maxTimeoutMs,
    );

    const handle: SubagentHandle = {
      taskId: this.generateId(),
      parentId,
      depth: currentDepth,
      createdAt: Date.now(),
      status: "queued",
      statusChangedAt: Date.now(),
      priority: params.priority ?? 5,
      partialOutput: "",
      finalOutput: null,
      error: null,
      abortController: new AbortController(),
      prompt: params.prompt,
      instructions: params.instructions ?? null,
      timeoutMs,
      timeoutTimer: null,
      tokenUsage: { input: 0, output: 0 },
      metadata: params.metadata ?? {},
    };

    this.handles.set(handle.taskId, handle);
    if (!this.parentIndex.has(parentId)) {
      this.parentIndex.set(parentId, new Set());
    }
    this.parentIndex.get(parentId)!.add(handle.taskId);

    this.eventBus.emit("subagent:spawn" as any, {
      taskId: handle.taskId,
      parentId,
      depth: currentDepth,
      prompt: params.prompt,
      priority: handle.priority,
    });
    this.telemetry?.recordMetric("subagent.dispatch.count", 1);

    this.scheduler?.enqueue(handle);
    return handle;
  }

  // -------------------------------------------------------------------------
  // Status Transitions
  // -------------------------------------------------------------------------

  transition(
    taskId: string,
    newStatus: SubagentTaskStatus,
    data?: {
      partialOutput?: string;
      finalOutput?: string;
      error?: string;
    },
  ): void {
    const handle = this.handles.get(taskId);
    if (!handle) return;
    if (TERMINAL_STATES.has(handle.status)) return;

    // Validate transition
    const allowedTargets = VALID_TRANSITIONS.get(handle.status);
    if (!allowedTargets || !allowedTargets.has(newStatus)) return;

    const previousStatus = handle.status;
    handle.status = newStatus;
    handle.statusChangedAt = Date.now();

    if (data?.partialOutput !== undefined) {
      handle.partialOutput += data.partialOutput;
    }
    if (data?.finalOutput !== undefined) {
      handle.finalOutput = data.finalOutput;
    }
    if (data?.error !== undefined) {
      handle.error = data.error;
    }

    this.eventBus.emit("subagent:status-change" as any, {
      taskId,
      previousStatus,
      newStatus,
      parentId: handle.parentId,
    });

    if (TERMINAL_STATES.has(newStatus)) {
      if (handle.timeoutTimer) {
        clearTimeout(handle.timeoutTimer);
        handle.timeoutTimer = null;
      }

      this.eventBus.emit("subagent:complete" as any, {
        taskId,
        status: newStatus,
        parentId: handle.parentId,
        durationMs: Date.now() - handle.createdAt,
        tokenUsage: handle.tokenUsage,
      });
      this.telemetry?.recordMetric(`subagent.status.${newStatus}`, 1);
      this.telemetry?.recordMetric(
        "subagent.completion.duration_ms",
        Date.now() - handle.createdAt,
      );

      const listeners = this.completionListeners.get(taskId);
      if (listeners) {
        for (const cb of listeners) cb(handle);
        this.completionListeners.delete(taskId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  get(taskId: string): SubagentHandle | undefined {
    return this.handles.get(taskId);
  }

  getByParent(parentId: string): SubagentHandle[] {
    const ids = this.parentIndex.get(parentId);
    if (!ids) return [];
    return [...ids]
      .map((id) => this.handles.get(id)!)
      .filter(Boolean);
  }

  get activeCount(): number {
    return [...this.handles.values()].filter(
      (h) => h.status === "running" || h.status === "streaming",
    ).length;
  }

  get queuedCount(): number {
    return [...this.handles.values()].filter(
      (h) => h.status === "queued",
    ).length;
  }

  get totalCount(): number {
    return this.handles.size;
  }

  // -------------------------------------------------------------------------
  // Await
  // -------------------------------------------------------------------------

  waitForCompletion(
    taskId: string,
    timeoutMs: number,
  ): Promise<SubagentHandle> {
    const handle = this.handles.get(taskId);
    if (!handle) {
      return Promise.reject(new Error(`Task "${taskId}" not found`));
    }
    if (TERMINAL_STATES.has(handle.status)) {
      return Promise.resolve(handle);
    }

    return new Promise<SubagentHandle>((resolve) => {
      const timer = setTimeout(() => {
        const listeners = this.completionListeners.get(taskId);
        if (listeners) {
          const idx = listeners.indexOf(onComplete);
          if (idx !== -1) listeners.splice(idx, 1);
        }
        // Return current handle state on timeout
        resolve(handle);
      }, timeoutMs);

      const onComplete = (h: SubagentHandle) => {
        clearTimeout(timer);
        resolve(h);
      };

      if (!this.completionListeners.has(taskId)) {
        this.completionListeners.set(taskId, []);
      }
      this.completionListeners.get(taskId)!.push(onComplete);
    });
  }

  // -------------------------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------------------------

  cancel(taskId: string, reason = "cancelled"): boolean {
    const handle = this.handles.get(taskId);
    if (!handle || TERMINAL_STATES.has(handle.status)) return false;

    handle.abortController.abort(reason);
    this.transition(taskId, "cancelled", { error: reason });

    // Cascade to children that have this task as parent
    for (const h of this.handles.values()) {
      if (h.parentId === taskId && !TERMINAL_STATES.has(h.status)) {
        this.cancel(h.taskId, `parent-cancelled:${reason}`);
      }
    }

    return true;
  }

  cancelAll(parentId: string): number {
    let count = 0;
    const ids = this.parentIndex.get(parentId);
    if (!ids) return 0;
    for (const id of ids) {
      if (this.cancel(id, "parent-shutdown")) count++;
    }
    return count;
  }

  // -------------------------------------------------------------------------
  // Garbage Collection
  // -------------------------------------------------------------------------

  /** Exposed for testing */
  gc(): void {
    const now = Date.now();
    let collected = 0;

    for (const [taskId, handle] of this.handles) {
      // Collect terminal handles past TTL
      if (
        TERMINAL_STATES.has(handle.status) &&
        now - handle.statusChangedAt > this.limits.gcTtlMs
      ) {
        this.handles.delete(taskId);
        this.parentIndex.get(handle.parentId)?.delete(taskId);
        this.completionListeners.delete(taskId);
        collected++;
      }

      // Watchdog: force-timeout stuck handles (2x timeout)
      if (
        (handle.status === "running" || handle.status === "streaming") &&
        now - handle.createdAt > handle.timeoutMs * 2
      ) {
        this.cancel(taskId, "watchdog-timeout");
      }
    }

    // Aggressive GC when handle count is excessive
    if (this.handles.size > this.limits.maxConcurrentGlobal * 10) {
      for (const [taskId, handle] of this.handles) {
        if (TERMINAL_STATES.has(handle.status)) {
          this.handles.delete(taskId);
          this.parentIndex.get(handle.parentId)?.delete(taskId);
          this.completionListeners.delete(taskId);
          collected++;
        }
      }
    }

    if (collected > 0) {
      this.telemetry?.recordMetric("subagent.gc.collected", collected);
    }

    this.telemetry?.recordMetric("subagent.queue.depth", this.queuedCount);
    this.telemetry?.recordMetric("subagent.active.count", this.activeCount);
  }
}

export function isTerminalStatus(status: SubagentTaskStatus): boolean {
  return TERMINAL_STATES.has(status);
}
