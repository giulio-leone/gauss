// =============================================================================
// gauss/providers/groq — Groq adapter
// =============================================================================

import { createGroq } from "@ai-sdk/groq";
import type { GroqProviderSettings } from "@ai-sdk/groq";

export type GroqProviderOptions = GroqProviderSettings;

/**
 * Create a Groq provider instance.
 *
 * API key is auto-detected from `GROQ_API_KEY` environment variable.
 *
 * @example
 * ```ts
 * import { groq } from 'gauss/providers'
 * import { agent } from 'gauss'
 *
 * const a = agent({ model: groq('llama-3.3-70b-versatile'), instructions: '...' }).build()
 * ```
 */
export function groq(modelId: string, options?: GroqProviderOptions) {
  const provider = createGroq(options);
  return provider(modelId);
}
