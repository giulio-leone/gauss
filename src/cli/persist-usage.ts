// =============================================================================
// persistUsage — Append session cost data to ~/.gaussflow/usage.json
// =============================================================================

import type { CostTrackerPort } from "../ports/cost-tracker.port.js";

export async function persistUsage(tracker: CostTrackerPort): Promise<void> {
  const { appendFileSync, existsSync, mkdirSync } = await import("node:fs");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = join(homedir(), ".gaussflow");
  const usagePath = join(dir, "usage.ndjson");

  const records: unknown[] = JSON.parse(tracker.exportUsage());
  if (records.length === 0) return;

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  for (const record of records) {
    appendFileSync(usagePath, JSON.stringify(record) + '\n');
  }
}
