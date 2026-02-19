// =============================================================================
// WorkerPool<T, R> — Generic async work-stealing pool with dynamic sizing
// =============================================================================

import { PriorityQueue } from './priority-queue.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkerPoolConfig {
  initialSize: number;
  minSize: number;
  maxSize: number;
  taskTimeoutMs: number;
  heartbeatIntervalMs: number;
  idleShrinkMs: number;
  growThreshold: number;
}

export interface WorkerPoolMetrics {
  activeWorkers: number;
  idleWorkers: number;
  queueDepth: number;
  totalCompleted: number;
  totalFailed: number;
  throughputPerSecond: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  utilizationRatio: number;
  workStealCount: number;
}

export type WorkerPoolEvent<T, R> =
  | { type: 'task:started'; taskId: string; workerId: number }
  | { type: 'task:completed'; taskId: string; result: R; durationMs: number }
  | { type: 'task:failed'; taskId: string; error: Error; durationMs: number }
  | { type: 'task:timeout'; taskId: string; workerId: number }
  | { type: 'worker:spawned'; workerId: number; poolSize: number }
  | { type: 'worker:removed'; workerId: number; poolSize: number; reason: string }
  | { type: 'pool:drained' }
  | { type: 'pool:pressure'; queueDepth: number; activeWorkers: number };

interface PoolTask<T, R = unknown> {
  readonly id: string;
  readonly input: T;
  readonly priority: number;
  readonly enqueuedAt: number;
  readonly abortController: AbortController;
  readonly resolve: (result: R | PromiseLike<R>) => void;
  readonly reject: (error: Error) => void;
}

type WorkerState = 'idle' | 'busy' | 'dead';

interface WorkerSlot<T, R = unknown> {
  state: WorkerState;
  currentTask: PoolTask<T, R> | null;
  idleSince: number;
  wakeResolve: (() => void) | null;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_POOL_CONFIG: WorkerPoolConfig = {
  initialSize: 4,
  minSize: 1,
  maxSize: 16,
  taskTimeoutMs: 60_000,
  heartbeatIntervalMs: 5_000,
  idleShrinkMs: 30_000,
  growThreshold: 3,
};

// ── Implementation ───────────────────────────────────────────────────────────

export class WorkerPool<T, R> {
  private readonly queue: PriorityQueue<PoolTask<T, R>>;
  private readonly workers = new Map<number, WorkerSlot<T, R>>();
  private readonly executor: (input: T, signal: AbortSignal) => Promise<R>;
  private readonly config: WorkerPoolConfig;
  private readonly onEvent?: (event: WorkerPoolEvent<T, R>) => void;
  private readonly latencies: number[] = [];
  private readonly completionTimestamps: number[] = [];
  private static readonly MAX_METRICS_ENTRIES = 1000;

  private nextWorkerId = 0;
  private draining = false;
  private drainingResolve?: () => void;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private totalCompleted = 0;
  private totalFailed = 0;
  private workStealCount = 0;

  constructor(
    executor: (input: T, signal: AbortSignal) => Promise<R>,
    config?: Partial<WorkerPoolConfig>,
    onEvent?: (event: WorkerPoolEvent<T, R>) => void,
  ) {
    this.executor = executor;
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.onEvent = onEvent;
    this.queue = new PriorityQueue<PoolTask<T, R>>(
      (a, b) => a.priority - b.priority,
    );

    for (let i = 0; i < this.config.initialSize; i++) {
      this.spawnWorker();
    }
    this.startHeartbeatMonitor();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  submit(id: string, input: T, priority = 0): Promise<R> {
    if (this.draining) throw new Error('Pool is draining, cannot submit');

    return new Promise<R>((resolve, reject) => {
      const task: PoolTask<T, R> = {
        id,
        input,
        priority,
        enqueuedAt: Date.now(),
        abortController: new AbortController(),
        resolve,
        reject,
      };

      this.queue.enqueue(task);
      this.wakeOneIdleWorker();
    });
  }

  async drain(timeoutMs = 30_000): Promise<void> {
    this.draining = true;

    if (this.allIdle() && this.queue.size === 0) {
      this.cleanup();
      this.emit({ type: 'pool:drained' });
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.drainingResolve = () => {
        this.cleanup();
        this.emit({ type: 'pool:drained' });
        resolve();
      };

      const timer = setTimeout(() => {
        for (const [, slot] of this.workers) {
          slot.currentTask?.abortController.abort(
            new Error('Pool drain timeout'),
          );
          slot.state = 'dead';
          if (slot.wakeResolve) {
            slot.wakeResolve();
            slot.wakeResolve = null;
          }
        }
        this.cleanup();
        reject(new Error(`Drain timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const originalResolve = this.drainingResolve!;
      this.drainingResolve = () => {
        clearTimeout(timer);
        originalResolve();
      };

      // Wake all idle workers so they can detect drain
      for (const [, slot] of this.workers) {
        if (slot.state === 'idle' && slot.wakeResolve) {
          slot.wakeResolve();
          slot.wakeResolve = null;
        }
      }
    });
  }

  getMetrics(): WorkerPoolMetrics {
    let active = 0;
    let idle = 0;
    for (const slot of this.workers.values()) {
      if (slot.state === 'busy') active++;
      else if (slot.state === 'idle') idle++;
    }

    const now = Date.now();
    const windowMs = 60_000;
    const recentCompletions = this.completionTimestamps.filter(
      (t) => now - t < windowMs,
    );

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p = (pct: number) => {
      if (sorted.length === 0) return 0;
      const idx = Math.min(
        Math.floor((pct / 100) * sorted.length),
        sorted.length - 1,
      );
      return sorted[idx];
    };

    return {
      activeWorkers: active,
      idleWorkers: idle,
      queueDepth: this.queue.size,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      throughputPerSecond:
        recentCompletions.length > 0
          ? recentCompletions.length / (windowMs / 1000)
          : 0,
      latencyP50Ms: p(50),
      latencyP95Ms: p(95),
      latencyP99Ms: p(99),
      utilizationRatio:
        this.workers.size > 0 ? active / this.workers.size : 0,
      workStealCount: this.workStealCount,
    };
  }

  // ── Worker lifecycle ───────────────────────────────────────────────────────

  private spawnWorker(): void {
    const id = this.nextWorkerId++;
    const slot: WorkerSlot<T, R> = {
      state: 'idle',
      currentTask: null,
      idleSince: Date.now(),
      wakeResolve: null,
    };
    this.workers.set(id, slot);
    this.emit({
      type: 'worker:spawned',
      workerId: id,
      poolSize: this.workers.size,
    });
    // Fire-and-forget the worker loop
    this.workerLoop(id).catch(() => {});
  }

  private removeWorker(id: number, reason: string): void {
    const slot = this.workers.get(id);
    if (!slot) return;
    slot.state = 'dead';
    if (slot.wakeResolve) {
      slot.wakeResolve();
      slot.wakeResolve = null;
    }
    this.workers.delete(id);
    this.emit({
      type: 'worker:removed',
      workerId: id,
      poolSize: this.workers.size,
      reason,
    });
  }

  private async workerLoop(workerId: number): Promise<void> {
    const slot = this.workers.get(workerId)!;

    while (slot.state !== 'dead') {
      const task = this.queue.dequeue();

      if (!task) {
        slot.state = 'idle';
        slot.idleSince = Date.now();

        if (this.draining && this.allIdle() && this.queue.size === 0) {
          this.drainingResolve?.();
          return;
        }

        // Park until woken
        await new Promise<void>((resolve) => {
          slot.wakeResolve = resolve;
        });

        if ((slot.state as WorkerState) === 'dead') return;
        continue;
      }

      // Work-stealing: took a task from the shared queue
      this.workStealCount++;
      slot.state = 'busy';
      slot.currentTask = task;

      this.emit({ type: 'task:started', taskId: task.id, workerId });
      const startMs = Date.now();

      try {
        const result = await this.executeWithTimeout(task, workerId);
        const durationMs = Date.now() - startMs;

        this.latencies.push(durationMs);
        this.completionTimestamps.push(Date.now());
        if (this.latencies.length > WorkerPool.MAX_METRICS_ENTRIES) {
          this.latencies.splice(0, this.latencies.length - WorkerPool.MAX_METRICS_ENTRIES);
        }
        if (this.completionTimestamps.length > WorkerPool.MAX_METRICS_ENTRIES) {
          this.completionTimestamps.splice(0, this.completionTimestamps.length - WorkerPool.MAX_METRICS_ENTRIES);
        }
        this.totalCompleted++;

        this.emit({
          type: 'task:completed',
          taskId: task.id,
          result,
          durationMs,
        });
        task.resolve(result);
      } catch (error) {
        const durationMs = Date.now() - startMs;
        this.latencies.push(durationMs);
        this.totalFailed++;

        const err =
          error instanceof Error ? error : new Error(String(error));
        this.emit({
          type: 'task:failed',
          taskId: task.id,
          error: err,
          durationMs,
        });
        task.reject(err);
      } finally {
        slot.currentTask = null;
      }
    }
  }

  private executeWithTimeout(
    task: PoolTask<T, R>,
    workerId: number,
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          task.abortController.abort(
            new Error(`Task timeout after ${this.config.taskTimeoutMs}ms`),
          );
          this.emit({
            type: 'task:timeout',
            taskId: task.id,
            workerId,
          });
          reject(
            new Error(`Task "${task.id}" timed out after ${this.config.taskTimeoutMs}ms`),
          );
        }
      }, this.config.taskTimeoutMs);

      this.executor(task.input, task.abortController.signal).then(
        (result) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(result);
          }
        },
        (error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        },
      );
    });
  }

  // ── Autoscaling ────────────────────────────────────────────────────────────

  private autoscale(): void {
    const now = Date.now();
    let active = 0;
    let idle = 0;
    for (const slot of this.workers.values()) {
      if (slot.state === 'busy') active++;
      else if (slot.state === 'idle') idle++;
    }

    // Grow: deep queue + all busy
    if (
      this.queue.size > this.config.growThreshold &&
      idle === 0 &&
      this.workers.size < this.config.maxSize
    ) {
      const toAdd = Math.min(
        Math.ceil(this.queue.size / 2),
        this.config.maxSize - this.workers.size,
      );
      for (let i = 0; i < toAdd; i++) this.spawnWorker();
    }

    // Shrink: excess idle workers
    if (idle > 1 && this.workers.size > this.config.minSize) {
      for (const [id, slot] of this.workers) {
        if (
          slot.state === 'idle' &&
          now - slot.idleSince > this.config.idleShrinkMs &&
          this.workers.size > this.config.minSize
        ) {
          this.removeWorker(id, 'idle-timeout');
        }
      }
    }
  }

  // ── Health monitoring ──────────────────────────────────────────────────────

  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setInterval(() => {
      this.autoscale();
    }, this.config.heartbeatIntervalMs);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private wakeOneIdleWorker(): void {
    for (const [, slot] of this.workers) {
      if (slot.state === 'idle' && slot.wakeResolve) {
        slot.wakeResolve();
        slot.wakeResolve = null;
        return;
      }
    }
  }

  private allIdle(): boolean {
    for (const slot of this.workers.values()) {
      if (slot.state === 'busy') return false;
    }
    return true;
  }

  private emit(event: WorkerPoolEvent<T, R>): void {
    this.onEvent?.(event);
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const [id] of this.workers) {
      const slot = this.workers.get(id)!;
      slot.state = 'dead';
      if (slot.wakeResolve) {
        slot.wakeResolve();
        slot.wakeResolve = null;
      }
    }
  }
}
