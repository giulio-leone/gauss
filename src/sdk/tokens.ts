/**
 * Token counting utilities backed by Rust core (tiktoken).
 */
import {
  count_tokens,
  count_tokens_for_model,
  count_message_tokens,
  get_context_window_size,
  estimate_cost,
} from "gauss-napi";

import type { CostEstimate, JsMessage } from "./types.js";

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
