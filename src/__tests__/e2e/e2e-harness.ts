// =============================================================================
// E2E Test Harness — Shared utilities for real-provider integration tests
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";

/** Skip the entire suite if the given env var is not set. */
export function requireEnv(varName: string): string {
  const value = process.env[varName];
  if (!value) {
    throw new Error(`E2E: ${varName} not set — skipping`);
  }
  return value;
}

/** Default timeout for E2E tests (LLM calls can be slow). */
export const E2E_TIMEOUT = 60_000;

/** Assert that a string looks like meaningful text (not empty, not just whitespace). */
export function assertNonTrivialText(text: string, minLength = 5): void {
  expect(text).toBeDefined();
  expect(text.trim().length).toBeGreaterThanOrEqual(minLength);
}

/** Assert token usage is plausible. */
export function assertTokenUsage(usage: {
  inputTokens: number;
  outputTokens: number;
}): void {
  expect(usage.inputTokens).toBeGreaterThan(0);
  expect(usage.outputTokens).toBeGreaterThan(0);
}
