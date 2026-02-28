// =============================================================================
// SaveQueue Port — Persistent state queue for crash recovery
// =============================================================================

/**
 * Entry in the save queue — represents a pending state mutation.
 */
export interface SaveEntry {
  id: string;
  sessionId: string;
  key: string;
  value: unknown;
  timestamp: number;
  /** Number of retry attempts */
  retries: number;
}

/**
 * SaveQueuePort — Durable write-ahead log for agent state.
 *
 * Guarantees: at-least-once delivery of state mutations.
 * On crash, replays unacknowledged entries to the target storage.
 */
export interface SaveQueuePort {
  /** Enqueue a state mutation. Returns entry ID. */
  enqueue(sessionId: string, key: string, value: unknown): string;

  /** Acknowledge successful persistence (removes from queue). */
  ack(id: string): void;

  /** Get all unacknowledged entries (for crash recovery replay). */
  pending(): SaveEntry[];

  /** Get pending entries for a specific session. */
  pendingForSession(sessionId: string): SaveEntry[];

  /** Flush all entries by invoking the drain callback. */
  flush(drain: (entry: SaveEntry) => Promise<void>): Promise<FlushResult>;

  /** Number of pending entries. */
  size(): number;

  /** Clear all entries (use with caution). */
  clear(): void;

  /** Start auto-flush interval. */
  startAutoFlush(
    drain: (entry: SaveEntry) => Promise<void>,
    intervalMs?: number,
  ): void;

  /** Stop auto-flush. */
  stopAutoFlush(): void;
}

export interface FlushResult {
  succeeded: number;
  failed: number;
  errors: Array<{ id: string; error: unknown }>;
}
