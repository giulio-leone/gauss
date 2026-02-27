// =============================================================================
// AgentMemoryPort — Persistent agent memory & context contract
// =============================================================================

export interface AgentMemoryPort {
  store(entry: MemoryEntry): Promise<void>;
  recall(query: string, options?: RecallOptions): Promise<MemoryEntry[]>;
  summarize(entries: MemoryEntry[]): Promise<string>;
  clear(): Promise<void>;
  getStats(): Promise<MemoryStats>;
}

export type MemoryTier =
  | 'short'
  | 'working'
  | 'semantic'
  | 'observation';

export interface MemoryEntry {
  id: string;
  content: string;
  type: 'conversation' | 'fact' | 'preference' | 'task' | 'summary';
  tier?: MemoryTier;
  timestamp: string;
  metadata?: Record<string, unknown>;
  importance?: number; // 0-1
  sessionId?: string;
}

export interface RecallOptions {
  limit?: number; // default 10
  type?: MemoryEntry['type'];
  tier?: MemoryTier;
  includeTiers?: MemoryTier[];
  sessionId?: string;
  minImportance?: number;
  query?: string; // keyword search
}

export interface MemoryStats {
  totalEntries: number;
  byType: Record<string, number>;
  byTier?: Record<MemoryTier, number>;
  oldestEntry?: string;
  newestEntry?: string;
}
