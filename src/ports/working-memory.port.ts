// =============================================================================
// WorkingMemoryPort — Short-lived operational context with TTL
// =============================================================================

export interface WorkingMemoryEntry {
  key: string;
  value: unknown;
  createdAt: number;
  expiresAt: number;
}

export interface WorkingMemoryPort {
  /** Get a value by key */
  get<T = unknown>(key: string): Promise<T | null>;

  /** Set a value with optional TTL in ms (0 = no expiry) */
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;

  /** Delete a key */
  delete(key: string): Promise<boolean>;

  /** List all active keys */
  list(): Promise<WorkingMemoryEntry[]>;

  /** Clear all entries */
  clear(): Promise<void>;
}
