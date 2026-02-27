// =============================================================================
// gauss/providers/anthropic — Anthropic adapter
// =============================================================================

import { createAnthropic } from "@ai-sdk/anthropic";
import type { AnthropicProviderSettings } from "@ai-sdk/anthropic";

export type AnthropicProviderOptions = AnthropicProviderSettings;

/**
 * Create an Anthropic provider instance.
 *
 * API key is auto-detected from `ANTHROPIC_API_KEY` environment variable.
 *
 * @example
 * ```ts
 * import { anthropic } from 'gauss/providers'
 * import { agent } from 'gauss'
 *
 * const a = agent({ model: anthropic('claude-sonnet-4-20250514'), instructions: '...' }).build()
 * ```
 */
export function anthropic(modelId: string, options?: AnthropicProviderOptions) {
  const provider = createAnthropic(options);
  return provider(modelId);
}
