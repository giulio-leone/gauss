// =============================================================================
// SaveQueue Adapter — In-memory write-ahead log with auto-flush
// =============================================================================

import type {
  SaveQueuePort,
  SaveEntry,
  FlushResult,
} from "../../ports/save-queue.port.js";

let nextId = 1;

export interface SaveQueueOptions {
  /** Max entries before forced flush (default: 1000) */
  maxSize?: number;
  /** Max retry attempts per entry (default: 3) */
  maxRetries?: number;
}

export class SaveQueue implements SaveQueuePort {
  private queue = new Map<string, SaveEntry>();
  private maxSize: number;
  private maxRetries: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SaveQueueOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  enqueue(sessionId: string, key: string, value: unknown): string {
    const id = `sq-${nextId++}`;
    const entry: SaveEntry = {
      id,
      sessionId,
      key,
      value,
      timestamp: Date.now(),
      retries: 0,
    };
    this.queue.set(id, entry);

    // Evict oldest if over capacity
    if (this.queue.size > this.maxSize) {
      const oldest = this.queue.keys().next().value;
      if (oldest) this.queue.delete(oldest);
    }

    return id;
  }

  ack(id: string): void {
    this.queue.delete(id);
  }

  pending(): SaveEntry[] {
    return [...this.queue.values()];
  }

  pendingForSession(sessionId: string): SaveEntry[] {
    return [...this.queue.values()].filter((e) => e.sessionId === sessionId);
  }

  async flush(drain: (entry: SaveEntry) => Promise<void>): Promise<FlushResult> {
    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: unknown }> = [];

    const entries = [...this.queue.values()];
    for (const entry of entries) {
      try {
        await drain(entry);
        this.queue.delete(entry.id);
        succeeded++;
      } catch (err) {
        entry.retries++;
        if (entry.retries >= this.maxRetries) {
          this.queue.delete(entry.id);
          errors.push({ id: entry.id, error: err });
        }
        failed++;
      }
    }

    return { succeeded, failed, errors };
  }

  size(): number {
    return this.queue.size;
  }

  clear(): void {
    this.queue.clear();
  }

  startAutoFlush(
    drain: (entry: SaveEntry) => Promise<void>,
    intervalMs = 5000,
  ): void {
    this.stopAutoFlush();
    this.timer = setInterval(() => {
      if (this.queue.size > 0) {
        void this.flush(drain);
      }
    }, intervalMs);
  }

  stopAutoFlush(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
