// =============================================================================
// gauss/providers/openrouter — OpenRouter adapter (unified multi-provider API)
// =============================================================================

import { createOpenAI } from "@ai-sdk/openai";

export interface OpenRouterProviderOptions {
  /** OpenRouter API key. Defaults to `OPENROUTER_API_KEY` env variable. */
  apiKey?: string;
  /** Base URL override. Defaults to `https://openrouter.ai/api/v1`. */
  baseURL?: string;
}

/**
 * Create an OpenRouter provider instance.
 *
 * OpenRouter provides access to hundreds of models (OpenAI, Anthropic, Meta, etc.)
 * through a single, unified API with automatic fallbacks and cost optimization.
 *
 * API key is auto-detected from `OPENROUTER_API_KEY` environment variable.
 *
 * @example
 * ```ts
 * import { openrouter } from 'gauss/providers'
 * import { agent } from 'gauss'
 *
 * const a = agent({
 *   model: openrouter('anthropic/claude-sonnet-4-20250514'),
 *   instructions: '...'
 * }).build()
 * ```
 */
export function openrouter(
  modelId: string,
  options?: OpenRouterProviderOptions,
) {
  const provider = createOpenAI({
    baseURL: options?.baseURL ?? "https://openrouter.ai/api/v1",
    apiKey: options?.apiKey ?? process.env.OPENROUTER_API_KEY,
    name: "openrouter",
  });
  return provider(modelId);
}
