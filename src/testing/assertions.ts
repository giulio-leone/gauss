// =============================================================================
// Test Assertions for AgentTestResult
// =============================================================================

import type { AgentTestResult } from "./agent-test-runner.js";

export function assertToolCalled(
  result: AgentTestResult,
  toolName: string,
  args?: Record<string, unknown>,
): void {
  const match = result.toolCalls.find((tc) => tc.name === toolName);
  if (!match) {
    const called = result.toolCalls.map((tc) => tc.name).join(", ") || "(none)";
    throw new Error(
      `Expected tool "${toolName}" to be called, but it was not. Called tools: ${called}`,
    );
  }
  if (args !== undefined) {
    const actual = JSON.stringify(match.args);
    const expected = JSON.stringify(args);
    if (actual !== expected) {
      throw new Error(
        `Tool "${toolName}" was called with ${actual}, expected ${expected}`,
      );
    }
  }
}

export function assertToolNotCalled(
  result: AgentTestResult,
  toolName: string,
): void {
  const match = result.toolCalls.find((tc) => tc.name === toolName);
  if (match) {
    throw new Error(
      `Expected tool "${toolName}" NOT to be called, but it was called with ${JSON.stringify(match.args)}`,
    );
  }
}

export function assertResponseContains(
  result: AgentTestResult,
  substring: string,
): void {
  if (!result.response.includes(substring)) {
    throw new Error(
      `Expected response to contain "${substring}", but got: "${result.response}"`,
    );
  }
}

export function assertResponseMatches(
  result: AgentTestResult,
  pattern: RegExp,
): void {
  if (!pattern.test(result.response)) {
    throw new Error(
      `Expected response to match ${pattern}, but got: "${result.response}"`,
    );
  }
}

export function assertMaxSteps(
  result: AgentTestResult,
  max: number,
): void {
  if (result.steps > max) {
    throw new Error(
      `Expected at most ${max} steps, but got ${result.steps}`,
    );
  }
}

export function assertMaxTokens(
  result: AgentTestResult,
  max: number,
): void {
  const total = result.tokenUsage.input + result.tokenUsage.output;
  if (total > max) {
    throw new Error(
      `Expected at most ${max} total tokens, but used ${total} (input: ${result.tokenUsage.input}, output: ${result.tokenUsage.output})`,
    );
  }
}
