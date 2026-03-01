/**
 * Retry utilities — exponential backoff and configurable retry logic.
 *
 * @example
 *   import { withRetry, RetryConfig } from "gauss-ts";
 *
 *   const result = await withRetry(() => agent.run("Hello"), {
 *     maxRetries: 3,
 *     backoff: "exponential",
 *   });
 *
 *   // Or wrap an agent:
 *   const resilientRun = retryable(agent, { maxRetries: 5 });
 *   const result = await resilientRun("Hello");
 */

import type { AgentResult, Message } from "./types.js";
import type { Agent } from "./agent.js";

// ─── Config ────────────────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Backoff strategy (default: "exponential"). */
  backoff?: "fixed" | "linear" | "exponential";
  /** Base delay in ms (default: 1000). */
  baseDelayMs?: number;
  /** Maximum delay in ms (default: 30000). */
  maxDelayMs?: number;
  /** Jitter factor 0–1 (default: 0.1). Adds randomness to prevent thundering herd. */
  jitter?: number;
  /** Optional predicate — retry only if this returns true for the error. */
  retryIf?: (error: Error, attempt: number) => boolean;
  /** Called on each retry attempt, useful for logging. */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

// ─── Delay calculation ─────────────────────────────────────────────

function computeDelay(config: Required<Pick<RetryConfig, "backoff" | "baseDelayMs" | "maxDelayMs" | "jitter">>, attempt: number): number {
  let delay: number;
  switch (config.backoff) {
    case "fixed":
      delay = config.baseDelayMs;
      break;
    case "linear":
      delay = config.baseDelayMs * attempt;
      break;
    case "exponential":
      delay = config.baseDelayMs * Math.pow(2, attempt - 1);
      break;
  }
  // Apply jitter
  const jitterRange = delay * config.jitter;
  delay += Math.random() * jitterRange * 2 - jitterRange;
  return Math.min(Math.max(0, delay), config.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── withRetry ─────────────────────────────────────────────────────

/**
 * Execute an async function with retry logic.
 *
 * @example
 *   const data = await withRetry(async () => {
 *     return await agent.run("Summarize this article");
 *   }, { maxRetries: 3, backoff: "exponential" });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const maxRetries = config?.maxRetries ?? 3;
  const backoff = config?.backoff ?? "exponential";
  const baseDelayMs = config?.baseDelayMs ?? 1000;
  const maxDelayMs = config?.maxDelayMs ?? 30000;
  const jitter = config?.jitter ?? 0.1;
  const retryIf = config?.retryIf;
  const onRetry = config?.onRetry;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxRetries) break;

      if (retryIf && !retryIf(lastError, attempt + 1)) break;

      const delayMs = computeDelay({ backoff, baseDelayMs, maxDelayMs, jitter }, attempt + 1);
      onRetry?.(lastError, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError!;
}

// ─── retryable ─────────────────────────────────────────────────────

/**
 * Wrap an agent's run method with retry logic. Returns a function
 * that accepts a prompt and returns an AgentResult.
 *
 * @example
 *   const run = retryable(agent, { maxRetries: 5 });
 *   const result = await run("Hello");
 */
export function retryable(
  agent: Agent,
  config?: RetryConfig
): (prompt: string | Message[]) => Promise<AgentResult> {
  return (prompt) => withRetry(() => agent.run(prompt), config);
}
