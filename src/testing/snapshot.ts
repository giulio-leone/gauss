// =============================================================================
// Snapshot — JSON-based snapshot creation & comparison
// =============================================================================

import type { AgentTestResult } from "./agent-test-runner.js";

/**
 * Creates a deterministic JSON snapshot of an AgentTestResult.
 * Excludes non-deterministic fields (duration).
 */
export function createSnapshot(result: AgentTestResult): string {
  const snapshot = {
    response: result.response,
    steps: result.steps,
    tokenUsage: {
      input: result.tokenUsage.input,
      output: result.tokenUsage.output,
    },
    toolCalls: result.toolCalls.map((tc) => ({
      args: tc.args,
      name: tc.name,
      result: tc.result,
    })),
  };
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Compares two snapshot strings line by line.
 */
export function compareSnapshots(
  current: string,
  expected: string,
): { match: boolean; diff?: string } {
  if (current === expected) {
    return { match: true };
  }

  const currentLines = current.split("\n");
  const expectedLines = expected.split("\n");
  const maxLines = Math.max(currentLines.length, expectedLines.length);
  const diffLines: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const cl = currentLines[i];
    const el = expectedLines[i];
    if (cl !== el) {
      if (el !== undefined) diffLines.push(`- ${el}`);
      if (cl !== undefined) diffLines.push(`+ ${cl}`);
    }
  }

  return {
    match: false,
    diff: diffLines.join("\n"),
  };
}
