// =============================================================================
// gauss/providers/anthropic — Anthropic adapter
// @deprecated Use gauss('anthropic', modelId) from 'gauss-ai/providers' instead.
// This wrapper will be removed in v6.0. The native Rust provider is faster.
// =============================================================================

import { createAnthropic } from "@ai-sdk/anthropic";
import type { AnthropicProviderSettings } from "@ai-sdk/anthropic";

export type AnthropicProviderOptions = AnthropicProviderSettings;

/**
 * Create an Anthropic provider instance.
 *
 * @deprecated Use `gauss('anthropic', modelId)` instead for native Rust performance.
 *
 * @example
 * ```ts
 * // ❌ Deprecated
 * import { anthropic } from 'gauss-ai/providers'
 * const model = anthropic('claude-sonnet-4-20250514')
 *
 * // ✅ Preferred — native Rust provider
 * import { gauss } from 'gauss-ai/providers'
 * const model = gauss('anthropic', 'claude-sonnet-4-20250514')
 * ```
 */
export function anthropic(modelId: string, options?: AnthropicProviderOptions) {
  const provider = createAnthropic(options);
  return provider(modelId);
}
