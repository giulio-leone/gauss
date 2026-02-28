// =============================================================================
// gauss/providers/openai — OpenAI adapter
// @deprecated Use gauss('openai', modelId) from 'gauss-ai/providers' instead.
// This wrapper will be removed in v6.0. The native Rust provider is faster.
// =============================================================================

import { createOpenAI } from "@ai-sdk/openai";
import type { OpenAIProviderSettings } from "@ai-sdk/openai";
import { wrapV3Model } from "../core/llm/v3-adapter.js";

export type OpenAIProviderOptions = OpenAIProviderSettings;

/**
 * Create an OpenAI provider instance.
 *
 * @deprecated Use `gauss('openai', modelId)` instead for native Rust performance.
 *
 * @example
 * ```ts
 * // ❌ Deprecated
 * import { openai } from 'gauss-ai/providers'
 * const model = openai('gpt-4o')
 *
 * // ✅ Preferred — native Rust provider
 * import { gauss } from 'gauss-ai/providers'
 * const model = gauss('openai', 'gpt-4o')
 * ```
 */
export function openai(modelId: string, options?: OpenAIProviderOptions) {
  const provider = createOpenAI(options);
  return wrapV3Model(provider.chat(modelId as any));
}
