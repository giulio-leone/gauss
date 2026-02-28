// =============================================================================
// gauss/providers/groq — Groq adapter
// @deprecated Use gauss('groq', modelId) from 'gauss-ai/providers' instead.
// This wrapper will be removed in v6.0. The native Rust provider is faster.
// =============================================================================

import { createGroq } from "@ai-sdk/groq";
import type { GroqProviderSettings } from "@ai-sdk/groq";

export type GroqProviderOptions = GroqProviderSettings;

/**
 * Create a Groq provider instance.
 *
 * @deprecated Use `gauss('groq', modelId)` instead for native Rust performance.
 */
export function groq(modelId: string, options?: GroqProviderOptions) {
  const provider = createGroq(options);
  return provider(modelId);
}
