// =============================================================================
// @giulio-leone/gaussflow-agent/testing — Barrel Export
// =============================================================================

export { createMockProvider } from "./mock-provider.js";
export type { MockResponse } from "./mock-provider.js";

export { runAgentTest } from "./agent-test-runner.js";
export type { AgentTestResult } from "./agent-test-runner.js";

export {
  assertToolCalled,
  assertToolNotCalled,
  assertResponseContains,
  assertResponseMatches,
  assertMaxSteps,
  assertMaxTokens,
} from "./assertions.js";

export { createSnapshot, compareSnapshots } from "./snapshot.js";
