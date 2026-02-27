// =============================================================================
// Shared memory statistics calculation
// =============================================================================

import type { MemoryEntry, MemoryStats } from "../../ports/agent-memory.port.js";

/**
 * Calculate memory statistics from an iterable of entries.
 */
export function calculateMemoryStats(entries: Iterable<MemoryEntry>): MemoryStats {
  const byType: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  let oldest: string | undefined;
  let newest: string | undefined;
  let totalEntries = 0;

  for (const entry of entries) {
    totalEntries++;
    byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    if (entry.tier) {
      byTier[entry.tier] = (byTier[entry.tier] ?? 0) + 1;
    }
    if (!oldest || entry.timestamp < oldest) oldest = entry.timestamp;
    if (!newest || entry.timestamp > newest) newest = entry.timestamp;
  }

  return {
    totalEntries,
    byType,
    byTier,
    oldestEntry: oldest,
    newestEntry: newest,
  };
}
