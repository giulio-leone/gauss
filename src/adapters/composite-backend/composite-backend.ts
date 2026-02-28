// =============================================================================
// CompositeBackend — Route arbitrary paths to different storage backends
// =============================================================================

/**
 * A generic key-value backend interface.
 */
export interface KVBackend {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

/**
 * Route rule — maps a path prefix to a specific backend.
 */
export interface RouteRule {
  /** Path prefix to match (e.g., "sessions/", "blobs/", "cache/") */
  prefix: string;
  /** Backend to route to */
  backend: KVBackend;
}

/**
 * CompositeBackend routes reads/writes to different backends based on key prefix.
 *
 * @example
 * ```ts
 * const backend = new CompositeBackend(defaultBackend, [
 *   { prefix: "sessions/", backend: redisBackend },
 *   { prefix: "blobs/", backend: s3Backend },
 *   { prefix: "cache/", backend: memoryBackend },
 * ]);
 *
 * await backend.set("sessions/abc", data);  // → redisBackend
 * await backend.set("blobs/file.png", data); // → s3Backend
 * await backend.set("other/key", data);      // → defaultBackend
 * ```
 */
export class CompositeBackend implements KVBackend {
  private readonly defaultBackend: KVBackend;
  private readonly rules: RouteRule[];

  constructor(defaultBackend: KVBackend, rules: RouteRule[] = []) {
    this.defaultBackend = defaultBackend;
    // Sort rules by prefix length (longest first) for most-specific match
    this.rules = [...rules].sort((a, b) => b.prefix.length - a.prefix.length);
  }

  private resolve(key: string): KVBackend {
    for (const rule of this.rules) {
      if (key.startsWith(rule.prefix)) return rule.backend;
    }
    return this.defaultBackend;
  }

  async get(key: string): Promise<unknown | null> {
    return this.resolve(key).get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    return this.resolve(key).set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.resolve(key).delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    if (prefix) {
      // Route to specific backend
      return this.resolve(prefix).list(prefix);
    }
    // List from all backends
    const allKeys = new Set<string>();
    for (const key of await this.defaultBackend.list()) {
      allKeys.add(key);
    }
    for (const rule of this.rules) {
      for (const key of await rule.backend.list(rule.prefix)) {
        allKeys.add(key);
      }
    }
    return [...allKeys];
  }
}

/**
 * Simple in-memory KV backend for testing.
 */
export class InMemoryKVBackend implements KVBackend {
  private store = new Map<string, unknown>();

  async get(key: string): Promise<unknown | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = [...this.store.keys()];
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  }
}
