// =============================================================================
// TieredAgentMemoryAdapter — Multi-tier composition for AgentMemoryPort
// =============================================================================

import type {
  AgentMemoryPort,
  MemoryEntry,
  MemoryStats,
  MemoryTier,
  RecallOptions,
} from "../../ports/agent-memory.port.js";
import { InMemoryAgentMemoryAdapter } from "./in-memory-agent-memory.adapter.js";

/** Max characters kept when summarizing memory entries */
const SUMMARY_MAX_LENGTH = 500;

const DEFAULT_TIER_WEIGHTS: Record<MemoryTier, number> = {
  short: 0.4,
  working: 0.3,
  semantic: 0.2,
  observation: 0.1,
};

const DEFAULT_TYPE_TO_TIER: Record<MemoryEntry["type"], MemoryTier> = {
  conversation: "short",
  task: "working",
  fact: "semantic",
  preference: "semantic",
  summary: "observation",
};

export interface TieredAgentMemoryAdapterOptions {
  shortTerm?: AgentMemoryPort;
  working?: AgentMemoryPort;
  semantic?: AgentMemoryPort;
  observation?: AgentMemoryPort;
  recallWeights?: Partial<Record<MemoryTier, number>>;
  typeToTierMap?: Partial<Record<MemoryEntry["type"], MemoryTier>>;
}

type TierAdapterMap = Record<MemoryTier, AgentMemoryPort>;

export class TieredAgentMemoryAdapter implements AgentMemoryPort {
  private readonly tiers: TierAdapterMap;
  private readonly recallWeights: Record<MemoryTier, number>;
  private readonly typeToTierMap: Record<MemoryEntry["type"], MemoryTier>;

  constructor(options: TieredAgentMemoryAdapterOptions = {}) {
    this.tiers = {
      short: options.shortTerm ?? new InMemoryAgentMemoryAdapter(),
      working: options.working ?? new InMemoryAgentMemoryAdapter(),
      semantic: options.semantic ?? new InMemoryAgentMemoryAdapter(),
      observation: options.observation ?? new InMemoryAgentMemoryAdapter(),
    };
    this.recallWeights = {
      ...DEFAULT_TIER_WEIGHTS,
      ...(options.recallWeights ?? {}),
    };
    this.typeToTierMap = {
      ...DEFAULT_TYPE_TO_TIER,
      ...(options.typeToTierMap ?? {}),
    };
  }

  async store(entry: MemoryEntry): Promise<void> {
    const tier = this.resolveTier(entry);
    await this.tiers[tier].store({
      ...entry,
      tier,
    });
  }

  async recall(query: string, options: RecallOptions = {}): Promise<MemoryEntry[]> {
    const limit = options.limit ?? 10;
    const selectedTiers = this.resolveRequestedTiers(options);

    if (selectedTiers.length === 0 || limit <= 0) {
      return [];
    }

    if (selectedTiers.length === 1) {
      return this.recallFromTier(selectedTiers[0]!, query, options);
    }

    const tierLimits = this.allocateTierLimits(selectedTiers, limit);

    const chunks = await Promise.all(
      selectedTiers.map((tier) =>
        this.recallFromTier(tier, query, {
          ...options,
          limit: tierLimits[tier],
        }),
      ),
    );

    const merged = new Map<string, MemoryEntry>();
    for (const entries of chunks) {
      for (const entry of entries) {
        const prev = merged.get(entry.id);
        if (!prev || entry.timestamp > prev.timestamp) {
          merged.set(entry.id, entry);
        }
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  async summarize(entries: MemoryEntry[]): Promise<string> {
    const combined = entries.map((e) => e.content).join("\n");
    return combined.length > SUMMARY_MAX_LENGTH
      ? `${combined.slice(0, SUMMARY_MAX_LENGTH)}...`
      : combined;
  }

  async clear(): Promise<void> {
    await Promise.all(
      (Object.keys(this.tiers) as MemoryTier[]).map((tier) =>
        this.tiers[tier].clear(),
      ),
    );
  }

  async getStats(): Promise<MemoryStats> {
    const entries = await Promise.all(
      (Object.keys(this.tiers) as MemoryTier[]).map(async (tier) => {
        const recalled = await this.tiers[tier].recall("", {
          limit: Number.MAX_SAFE_INTEGER,
        });
        return recalled.map((entry) => ({
          ...entry,
          tier: entry.tier ?? tier,
        }));
      }),
    );

    const all = entries.flat();
    const byType: Record<string, number> = {};
    const byTier: Record<MemoryTier, number> = {
      short: 0,
      working: 0,
      semantic: 0,
      observation: 0,
    };

    let oldestEntry: string | undefined;
    let newestEntry: string | undefined;

    for (const entry of all) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1;
      const tier = entry.tier ?? this.resolveTier(entry);
      byTier[tier] = (byTier[tier] ?? 0) + 1;

      if (!oldestEntry || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (!newestEntry || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }

    return {
      totalEntries: all.length,
      byType,
      byTier,
      oldestEntry,
      newestEntry,
    };
  }

  private resolveTier(entry: MemoryEntry): MemoryTier {
    return entry.tier ?? this.typeToTierMap[entry.type] ?? "short";
  }

  private resolveRequestedTiers(options: RecallOptions): MemoryTier[] {
    if (options.tier) return [options.tier];
    if (options.includeTiers && options.includeTiers.length > 0) {
      return Array.from(new Set(options.includeTiers));
    }
    return ["short", "working", "semantic", "observation"];
  }

  private async recallFromTier(
    tier: MemoryTier,
    query: string,
    options: RecallOptions,
  ): Promise<MemoryEntry[]> {
    const entries = await this.tiers[tier].recall(query, {
      ...options,
      tier: undefined,
      includeTiers: undefined,
    });

    return entries.map((entry) => ({
      ...entry,
      tier: entry.tier ?? tier,
    }));
  }

  private allocateTierLimits(
    tiers: MemoryTier[],
    limit: number,
  ): Record<MemoryTier, number> {
    const allocated: Record<MemoryTier, number> = {
      short: 0,
      working: 0,
      semantic: 0,
      observation: 0,
    };

    const weighted = tiers.map((tier) => ({
      tier,
      raw: Math.max(0, this.recallWeights[tier] ?? 0),
    }));
    const sum = weighted.reduce((acc, current) => acc + current.raw, 0);

    if (sum <= 0) {
      const fair = Math.floor(limit / tiers.length);
      let remaining = limit - fair * tiers.length;
      for (const tier of tiers) {
        allocated[tier] = fair;
      }
      for (let i = 0; i < tiers.length && remaining > 0; i++) {
        allocated[tiers[i]!] += 1;
        remaining--;
      }
      return allocated;
    }

    let assigned = 0;
    const remainders: Array<{ tier: MemoryTier; remainder: number }> = [];

    for (const item of weighted) {
      const exact = (item.raw / sum) * limit;
      const floor = Math.floor(exact);
      allocated[item.tier] = floor;
      assigned += floor;
      remainders.push({ tier: item.tier, remainder: exact - floor });
    }

    let remaining = limit - assigned;
    remainders.sort((a, b) => b.remainder - a.remainder);
    for (const item of remainders) {
      if (remaining <= 0) break;
      allocated[item.tier] += 1;
      remaining--;
    }

    return allocated;
  }
}
