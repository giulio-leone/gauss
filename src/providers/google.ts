// =============================================================================
// gauss/providers/google — Google Gemini adapter
// =============================================================================

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { GoogleGenerativeAIProviderSettings } from "@ai-sdk/google";

export type GoogleProviderOptions = GoogleGenerativeAIProviderSettings;

/**
 * Create a Google Gemini provider instance.
 *
 * API key is auto-detected from `GOOGLE_GENERATIVE_AI_API_KEY` environment variable.
 *
 * @example
 * ```ts
 * import { google } from 'gauss/providers'
 * import { agent } from 'gauss'
 *
 * const a = agent({ model: google('gemini-2.5-flash-preview-05-20'), instructions: '...' }).build()
 * ```
 */
export function google(modelId: string, options?: GoogleProviderOptions) {
  const provider = createGoogleGenerativeAI(options);
  return provider(modelId);
}
