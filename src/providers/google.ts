// =============================================================================
// gauss/providers/google — Google Gemini adapter
// @deprecated Use gauss('google', modelId) from 'gauss-ai/providers' instead.
// This wrapper will be removed in v6.0. The native Rust provider is faster.
// =============================================================================

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { GoogleGenerativeAIProviderSettings } from "@ai-sdk/google";

export type GoogleProviderOptions = GoogleGenerativeAIProviderSettings;

/**
 * Create a Google Gemini provider instance.
 *
 * @deprecated Use `gauss('google', modelId)` instead for native Rust performance.
 */
export function google(modelId: string, options?: GoogleProviderOptions) {
  const provider = createGoogleGenerativeAI(options);
  return provider(modelId);
}
