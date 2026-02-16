// =============================================================================
// InMemoryAgentMemoryAdapter — In-memory implementation of AgentMemoryPort
// =============================================================================

import type {
  AgentMemoryPort,
  MemoryEntry,
  RecallOptions,
  MemoryStats,
} from "../../ports/agent-memory.port.js";
import { calculateMemoryStats } from "./memory-utils.js";

export interface InMemoryAgentMemoryOptions {
  maxEntries?: number; // default 10000
}

export class InMemoryAgentMemoryAdapter implements AgentMemoryPort {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly insertionOrder: string[] = [];
  private readonly maxEntries: number;

  constructor(options: InMemoryAgentMemoryOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  async store(entry: MemoryEntry): Promise<void> {
    // If entry already exists, remove old position from order tracking
    if (this.entries.has(entry.id)) {
      const idx = this.insertionOrder.indexOf(entry.id);
      if (idx !== -1) this.insertionOrder.splice(idx, 1);
    }

    this.entries.set(entry.id, { ...entry });
    this.insertionOrder.push(entry.id);

    // LRU eviction
    while (this.insertionOrder.length > this.maxEntries) {
      const oldest = this.insertionOrder.shift();
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  async recall(_query: string, options: RecallOptions = {}): Promise<MemoryEntry[]> {
    const { limit = 10, type, sessionId, minImportance, query } = options;
    let results = Array.from(this.entries.values());

    if (type) {
      results = results.filter((e) => e.type === type);
    }
    if (sessionId) {
      results = results.filter((e) => e.sessionId === sessionId);
    }
    if (minImportance !== undefined) {
      results = results.filter((e) => (e.importance ?? 0) >= minImportance);
    }
    if (query) {
      const lower = query.toLowerCase();
      results = results.filter((e) => e.content.toLowerCase().includes(lower));
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return results.slice(0, limit);
  }

  async summarize(entries: MemoryEntry[]): Promise<string> {
    const combined = entries.map((e) => e.content).join("\n");
    return combined.length > 500 ? combined.slice(0, 500) + "..." : combined;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.insertionOrder.length = 0;
  }

  async getStats(): Promise<MemoryStats> {
    return calculateMemoryStats(this.entries.values());
  }
}
