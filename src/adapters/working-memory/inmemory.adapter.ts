// =============================================================================
// InMemoryWorkingMemory — TTL-based ephemeral key-value store
// =============================================================================

import type { WorkingMemoryPort, WorkingMemoryEntry } from "../../ports/working-memory.port.js";

interface StoredEntry {
  value: unknown;
  createdAt: number;
  expiresAt: number;
}

export class InMemoryWorkingMemory implements WorkingMemoryPort {
  private readonly store = new Map<string, StoredEntry>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const now = Date.now();
    this.store.set(key, {
      value: safeClone(value),
      createdAt: now,
      expiresAt: ttlMs && ttlMs > 0 ? now + ttlMs : 0,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async list(): Promise<WorkingMemoryEntry[]> {
    const now = Date.now();
    const entries: WorkingMemoryEntry[] = [];
    for (const [key, entry] of this.store) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      entries.push({
        key,
        value: safeClone(entry.value),
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
      });
    }
    return entries;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

function safeClone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  }
}
