// =============================================================================
// A2A Durable Task Queue — lease/ack/retry foundation for distributed execution
// =============================================================================

import type { A2ATask } from "./a2a-handler.js";

export interface A2ATaskRetryConfig {
  maxAttempts: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  jitterRatio: number;
}

export interface A2ATaskQueueConfig {
  leaseDurationMs: number;
  retentionMs: number;
  maxTerminalTasks: number;
  retry: A2ATaskRetryConfig;
  now?: () => number;
  idFactory?: () => string;
}

export interface A2ATaskLease {
  taskId: string;
  leaseId: string;
  workerId: string;
  expiresAt: string;
  attempt: number;
  maxAttempts: number;
}

export interface A2ATaskFailResult {
  task: A2ATask;
  willRetry: boolean;
  retryDelayMs: number;
  attempts: number;
  maxAttempts: number;
}

export interface A2ATaskQueueSnapshot {
  version: 1;
  entries: Array<{
    task: A2ATask;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: number;
    finishedAt?: number;
    lease?: {
      leaseId: string;
      workerId: string;
      expiresAt: number;
    };
  }>;
}

interface QueueEntry {
  task: A2ATask;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  finishedAt?: number;
  lease?: {
    leaseId: string;
    workerId: string;
    expiresAt: number;
  };
}

const DEFAULT_RETRY_CONFIG: A2ATaskRetryConfig = {
  maxAttempts: 3,
  initialBackoffMs: 250,
  backoffMultiplier: 2,
  maxBackoffMs: 30_000,
  jitterRatio: 0,
};

const DEFAULT_QUEUE_CONFIG: A2ATaskQueueConfig = {
  leaseDurationMs: 60_000,
  retentionMs: 3_600_000,
  maxTerminalTasks: 1_000,
  retry: DEFAULT_RETRY_CONFIG,
};

function cloneTask(task: A2ATask): A2ATask {
  return {
    ...task,
    metadata: task.metadata ? { ...task.metadata } : undefined,
  };
}

function isTerminalStatus(status: A2ATask["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export class A2ADurableTaskQueue {
  private readonly entries = new Map<string, QueueEntry>();
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly config: A2ATaskQueueConfig;

  constructor(config: Partial<A2ATaskQueueConfig> = {}) {
    const retry: A2ATaskRetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...(config.retry ?? {}),
    };

    this.config = {
      leaseDurationMs: config.leaseDurationMs ?? DEFAULT_QUEUE_CONFIG.leaseDurationMs,
      retentionMs: config.retentionMs ?? DEFAULT_QUEUE_CONFIG.retentionMs,
      maxTerminalTasks: config.maxTerminalTasks ?? DEFAULT_QUEUE_CONFIG.maxTerminalTasks,
      retry,
      now: config.now,
      idFactory: config.idFactory,
    };

    this.now = config.now ?? (() => Date.now());
    this.idFactory = config.idFactory ?? (() => crypto.randomUUID());
  }

  get size(): number {
    return this.entries.size;
  }

  enqueue(task: A2ATask, options: { maxAttempts?: number } = {}): A2ATask {
    if (this.entries.has(task.id)) {
      throw new Error(`Task already exists: ${task.id}`);
    }

    const now = this.now();
    const maxAttempts = Math.max(1, options.maxAttempts ?? this.config.retry.maxAttempts);

    const normalizedTask: A2ATask = {
      ...cloneTask(task),
      status: "queued",
      updatedAt: new Date(now).toISOString(),
      completedAt: undefined,
    };

    this.entries.set(task.id, {
      task: normalizedTask,
      attempts: 0,
      maxAttempts,
      nextAttemptAt: now,
    });

    return cloneTask(normalizedTask);
  }

  get(taskId: string): A2ATask | null {
    this.resolveExpiredLeases();
    const entry = this.entries.get(taskId);
    if (!entry) return null;
    return cloneTask(entry.task);
  }

  list(): A2ATask[] {
    this.resolveExpiredLeases();
    return [...this.entries.values()].map((entry) => cloneTask(entry.task));
  }

  acquire(taskId: string, workerId: string): A2ATaskLease | null {
    this.resolveExpiredLeases();

    const entry = this.entries.get(taskId);
    if (!entry) return null;

    const now = this.now();
    if (entry.task.status !== "queued") return null;
    if (entry.nextAttemptAt > now) return null;

    entry.attempts += 1;
    const leaseId = this.idFactory();
    entry.lease = {
      leaseId,
      workerId,
      expiresAt: now + this.config.leaseDurationMs,
    };
    entry.task.status = "running";
    entry.task.updatedAt = new Date(now).toISOString();

    return {
      taskId,
      leaseId,
      workerId,
      expiresAt: new Date(entry.lease.expiresAt).toISOString(),
      attempt: entry.attempts,
      maxAttempts: entry.maxAttempts,
    };
  }

  extendLease(taskId: string, leaseId: string, leaseDurationMs?: number): boolean {
    const entry = this.entries.get(taskId);
    if (!entry || !entry.lease) return false;
    if (entry.lease.leaseId !== leaseId) return false;

    const duration = Math.max(1, leaseDurationMs ?? this.config.leaseDurationMs);
    entry.lease.expiresAt = this.now() + duration;
    return true;
  }

  complete(taskId: string, output: string, leaseId?: string): A2ATask | null {
    const entry = this.entries.get(taskId);
    if (!entry) return null;

    if (isTerminalStatus(entry.task.status)) {
      return cloneTask(entry.task);
    }

    if (!this.validateLease(entry, leaseId)) {
      return null;
    }

    const nowIso = new Date(this.now()).toISOString();
    entry.task.status = "completed";
    entry.task.output = output;
    entry.task.error = undefined;
    entry.task.updatedAt = nowIso;
    entry.task.completedAt = nowIso;
    entry.lease = undefined;
    entry.finishedAt = this.now();

    return cloneTask(entry.task);
  }

  fail(taskId: string, error: string, leaseId?: string): A2ATaskFailResult | null {
    const entry = this.entries.get(taskId);
    if (!entry) return null;

    if (isTerminalStatus(entry.task.status)) {
      return {
        task: cloneTask(entry.task),
        willRetry: false,
        retryDelayMs: 0,
        attempts: entry.attempts,
        maxAttempts: entry.maxAttempts,
      };
    }

    if (!this.validateLease(entry, leaseId)) {
      return null;
    }

    const now = this.now();
    const nowIso = new Date(now).toISOString();
    entry.task.error = error;
    entry.task.updatedAt = nowIso;
    entry.lease = undefined;

    if (entry.attempts < entry.maxAttempts) {
      const retryDelayMs = this.computeBackoffDelay(entry.attempts);
      entry.task.status = "queued";
      entry.task.completedAt = undefined;
      entry.nextAttemptAt = now + retryDelayMs;

      return {
        task: cloneTask(entry.task),
        willRetry: true,
        retryDelayMs,
        attempts: entry.attempts,
        maxAttempts: entry.maxAttempts,
      };
    }

    entry.task.status = "failed";
    entry.task.completedAt = nowIso;
    entry.finishedAt = now;

    return {
      task: cloneTask(entry.task),
      willRetry: false,
      retryDelayMs: 0,
      attempts: entry.attempts,
      maxAttempts: entry.maxAttempts,
    };
  }

  cancel(taskId: string): A2ATask | null {
    const entry = this.entries.get(taskId);
    if (!entry) return null;

    if (isTerminalStatus(entry.task.status)) {
      return cloneTask(entry.task);
    }

    const nowIso = new Date(this.now()).toISOString();
    entry.task.status = "cancelled";
    entry.task.updatedAt = nowIso;
    entry.task.completedAt = nowIso;
    entry.lease = undefined;
    entry.finishedAt = this.now();

    return cloneTask(entry.task);
  }

  evictExpired(): void {
    const now = this.now();
    this.resolveExpiredLeases();

    const terminals: Array<{ taskId: string; finishedAt: number }> = [];

    for (const [taskId, entry] of this.entries) {
      if (!isTerminalStatus(entry.task.status)) continue;

      const finishedAt = entry.finishedAt ?? Date.parse(entry.task.updatedAt);
      if (now - finishedAt > this.config.retentionMs) {
        this.entries.delete(taskId);
        continue;
      }

      terminals.push({ taskId, finishedAt });
    }

    if (terminals.length <= this.config.maxTerminalTasks) return;

    terminals
      .sort((a, b) => a.finishedAt - b.finishedAt)
      .slice(0, terminals.length - this.config.maxTerminalTasks)
      .forEach(({ taskId }) => this.entries.delete(taskId));
  }

  snapshot(): A2ATaskQueueSnapshot {
    this.resolveExpiredLeases();
    return {
      version: 1,
      entries: [...this.entries.values()].map((entry) => ({
        task: cloneTask(entry.task),
        attempts: entry.attempts,
        maxAttempts: entry.maxAttempts,
        nextAttemptAt: entry.nextAttemptAt,
        finishedAt: entry.finishedAt,
        lease: entry.lease
          ? {
              leaseId: entry.lease.leaseId,
              workerId: entry.lease.workerId,
              expiresAt: entry.lease.expiresAt,
            }
          : undefined,
      })),
    };
  }

  hydrate(snapshot: A2ATaskQueueSnapshot | null | undefined): void {
    this.entries.clear();
    if (!snapshot || snapshot.version !== 1) return;

    for (const item of snapshot.entries) {
      this.entries.set(item.task.id, {
        task: cloneTask(item.task),
        attempts: item.attempts,
        maxAttempts: item.maxAttempts,
        nextAttemptAt: item.nextAttemptAt,
        finishedAt: item.finishedAt,
        lease: item.lease
          ? {
              leaseId: item.lease.leaseId,
              workerId: item.lease.workerId,
              expiresAt: item.lease.expiresAt,
            }
          : undefined,
      });
    }

    this.resolveExpiredLeases();
  }

  private validateLease(entry: QueueEntry, leaseId?: string): boolean {
    if (!entry.lease) return true;
    if (!leaseId) return false;
    if (entry.lease.leaseId !== leaseId) return false;
    if (entry.lease.expiresAt <= this.now()) return false;
    return true;
  }

  private resolveExpiredLeases(): void {
    const now = this.now();

    for (const entry of this.entries.values()) {
      if (!entry.lease) continue;
      if (entry.lease.expiresAt > now) continue;
      if (entry.task.status !== "running") {
        entry.lease = undefined;
        continue;
      }

      entry.lease = undefined;
      entry.task.error = "Task lease expired before completion";
      entry.task.updatedAt = new Date(now).toISOString();

      if (entry.attempts < entry.maxAttempts) {
        const retryDelayMs = this.computeBackoffDelay(entry.attempts);
        entry.task.status = "queued";
        entry.task.completedAt = undefined;
        entry.nextAttemptAt = now + retryDelayMs;
      } else {
        entry.task.status = "failed";
        entry.task.completedAt = new Date(now).toISOString();
        entry.finishedAt = now;
      }
    }
  }

  private computeBackoffDelay(attempt: number): number {
    const base = Math.max(1, this.config.retry.initialBackoffMs);
    const multiplier = Math.max(1, this.config.retry.backoffMultiplier);
    const capped = Math.min(
      this.config.retry.maxBackoffMs,
      Math.round(base * Math.pow(multiplier, Math.max(0, attempt - 1))),
    );

    const jitterRatio = Math.max(0, Math.min(1, this.config.retry.jitterRatio));
    if (jitterRatio === 0) return capped;

    const jitterMax = Math.round(capped * jitterRatio);
    const jitter = Math.floor(Math.random() * (jitterMax + 1));
    return Math.min(this.config.retry.maxBackoffMs, capped + jitter);
  }
}
