/**
 * Token counting and cost estimation utilities backed by Rust core (tiktoken).
 */
import {
  count_tokens,
  count_tokens_for_model,
  count_message_tokens,
  get_context_window_size,
  estimate_cost,
} from "gauss-napi";

import type { CostEstimate, JsMessage } from "./types.js";

// ─── Runtime Pricing Override ────────────────────────────────────────

/**
 * Per-token pricing for a model.
 * All values are in USD per token.
 */
export interface ModelPricing {
  inputPerToken: number;
  outputPerToken: number;
  reasoningPerToken?: number;
  cacheReadPerToken?: number;
  cacheCreationPerToken?: number;
}

const _pricingOverrides = new Map<string, ModelPricing>();

/**
 * Set custom pricing for a model (overrides built-in Rust pricing).
 *
 * @example
 * ```ts
 * setPricing("my-custom-model", {
 *   inputPerToken: 0.000003,
 *   outputPerToken: 0.000015,
 * });
 * ```
 */
export function setPricing(model: string, pricing: ModelPricing): void {
  _pricingOverrides.set(model, pricing);
}

/**
 * Get custom pricing for a model, if set.
 */
export function getPricing(model: string): ModelPricing | undefined {
  return _pricingOverrides.get(model);
}

/**
 * Clear all custom pricing overrides.
 */
export function clearPricing(): void {
  _pricingOverrides.clear();
}

// ─── Token Counting ──────────────────────────────────────────────────

export function countTokens(text: string): number {
  return count_tokens(text);
}

export function countTokensForModel(text: string, model: string): number {
  return count_tokens_for_model(text, model);
}

export function countMessageTokens(messages: JsMessage[]): number {
  return count_message_tokens(messages);
}

export function getContextWindowSize(model: string): number {
  return get_context_window_size(model);
}

// ─── Cost Estimation ─────────────────────────────────────────────────

export function estimateCost(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  }
): CostEstimate {
  // Check for SDK-level pricing override first
  const override = _pricingOverrides.get(model);
  if (override) {
    const inputCost = usage.inputTokens * override.inputPerToken;
    const outputCost = usage.outputTokens * override.outputPerToken;
    const reasoningCost = (usage.reasoningTokens ?? 0) * (override.reasoningPerToken ?? override.outputPerToken);
    const cacheReadCost = (usage.cacheReadTokens ?? 0) * (override.cacheReadPerToken ?? override.inputPerToken * 0.5);
    const cacheCreationCost = (usage.cacheCreationTokens ?? 0) * (override.cacheCreationPerToken ?? override.inputPerToken * 1.25);

    return {
      model,
      normalizedModel: model,
      currency: "USD",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheCreationTokens: usage.cacheCreationTokens ?? 0,
      inputCostUsd: inputCost,
      outputCostUsd: outputCost,
      reasoningCostUsd: reasoningCost,
      cacheReadCostUsd: cacheReadCost,
      cacheCreationCostUsd: cacheCreationCost,
      totalCostUsd: inputCost + outputCost + reasoningCost + cacheReadCost + cacheCreationCost,
    };
  }

  // Fall back to Rust core pricing
  const raw = estimate_cost(
    model,
    usage.inputTokens,
    usage.outputTokens,
    usage.reasoningTokens,
    usage.cacheReadTokens,
    usage.cacheCreationTokens
  ) as Record<string, unknown>;

  return {
    model: String(raw.model ?? model),
    normalizedModel: String(raw.normalized_model ?? model),
    currency: String(raw.currency ?? "USD"),
    inputTokens: Number(raw.input_tokens ?? usage.inputTokens),
    outputTokens: Number(raw.output_tokens ?? usage.outputTokens),
    reasoningTokens: Number(raw.reasoning_tokens ?? usage.reasoningTokens ?? 0),
    cacheReadTokens: Number(raw.cache_read_tokens ?? usage.cacheReadTokens ?? 0),
    cacheCreationTokens: Number(raw.cache_creation_tokens ?? usage.cacheCreationTokens ?? 0),
    inputCostUsd: Number(raw.input_cost_usd ?? 0),
    outputCostUsd: Number(raw.output_cost_usd ?? 0),
    reasoningCostUsd: Number(raw.reasoning_cost_usd ?? 0),
    cacheReadCostUsd: Number(raw.cache_read_cost_usd ?? 0),
    cacheCreationCostUsd: Number(raw.cache_creation_cost_usd ?? 0),
    totalCostUsd: Number(raw.total_cost_usd ?? 0),
  };
}
