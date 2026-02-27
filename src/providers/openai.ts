// =============================================================================
// gauss/providers/openai — OpenAI adapter
// =============================================================================

import { createOpenAI } from "@ai-sdk/openai";
import type { OpenAIProviderSettings } from "@ai-sdk/openai";

export type OpenAIProviderOptions = OpenAIProviderSettings;

/**
 * Create an OpenAI provider instance.
 *
 * API key is auto-detected from `OPENAI_API_KEY` environment variable.
 *
 * @example
 * ```ts
 * import { openai } from 'gauss/providers'
 * import { agent } from 'gauss'
 *
 * const a = agent({ model: openai('gpt-4o'), instructions: '...' }).build()
 * ```
 */
export function openai(modelId: string, options?: OpenAIProviderOptions) {
  const provider = createOpenAI(options);
  return provider(modelId);
}
