// =============================================================================
// BullMQ Queue Adapter — Implements QueuePort
// =============================================================================
//
// Requires: bullmq, ioredis (peer dependencies)
//
// Usage:
//   import { BullMQQueueAdapter } from 'gauss'
//   const queue = new BullMQQueueAdapter({ queueName: 'agent-tasks', redisUrl: '...' })
//   await queue.add('process', { agentId: '123' })
//   await queue.process(async (job) => { /* ... */ })
//
// =============================================================================

import type {
  QueuePort,
  QueueJob,
  QueueJobOptions,
  QueueJobResult,
  QueueProcessor,
} from "../../../ports/queue.port.js";

export interface BullMQQueueOptions {
  /** Queue name */
  queueName: string;
  /** Redis connection URL (default: redis://localhost:6379) */
  redisUrl?: string;
  /** Default job options */
  defaultJobOptions?: QueueJobOptions;
}

export class BullMQQueueAdapter implements QueuePort {
  private queue: any;
  private worker: any;
  private readonly options: BullMQQueueOptions;

  constructor(options: BullMQQueueOptions) {
    this.options = options;
  }

  /** Lazily initialize the BullMQ Queue */
  private async getQueue(): Promise<any> {
    if (this.queue) return this.queue;
    const { Queue } = await import("bullmq");
    const connection = this.parseRedisUrl(this.options.redisUrl ?? "redis://localhost:6379");
    this.queue = new Queue(this.options.queueName, {
      connection,
      defaultJobOptions: this.toBullMQOpts(this.options.defaultJobOptions),
    });
    return this.queue;
  }

  async add<T = Record<string, unknown>>(
    name: string,
    data: T,
    opts?: QueueJobOptions,
  ): Promise<QueueJob<T>> {
    const queue = await this.getQueue();
    const job = await queue.add(name, data, this.toBullMQOpts(opts));
    return {
      id: job.id!,
      name: job.name,
      data: job.data as T,
      opts,
    };
  }

  async process<T = Record<string, unknown>>(
    handler: QueueProcessor<T>,
    concurrency = 1,
  ): Promise<void> {
    const { Worker } = await import("bullmq");
    const connection = this.parseRedisUrl(this.options.redisUrl ?? "redis://localhost:6379");
    this.worker = new Worker(
      this.options.queueName,
      async (job: any) => {
        return handler({
          id: job.id!,
          name: job.name,
          data: job.data as T,
        });
      },
      { connection, concurrency },
    );
  }

  async getJob(id: string): Promise<QueueJobResult | null> {
    const queue = await this.getQueue();
    const job = await queue.getJob(id);
    if (!job) return null;

    const state = await job.getState();
    return {
      id: job.id!,
      name: job.name,
      data: job.data,
      status: state as QueueJobResult["status"],
      progress: typeof job.progress === "number" ? job.progress : 0,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
    };
  }

  async pause(): Promise<void> {
    const queue = await this.getQueue();
    await queue.pause();
  }

  async resume(): Promise<void> {
    const queue = await this.getQueue();
    await queue.resume();
  }

  async close(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private toBullMQOpts(opts?: QueueJobOptions): Record<string, unknown> | undefined {
    if (!opts) return undefined;
    return {
      delay: opts.delay,
      attempts: opts.attempts,
      backoff: opts.backoff,
      priority: opts.priority,
      removeOnComplete: opts.removeOnComplete,
      removeOnFail: opts.removeOnFail,
    };
  }

  private parseRedisUrl(url: string): { host: string; port: number; password?: string } {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      ...(parsed.password ? { password: parsed.password } : {}),
    };
  }
}
