// =============================================================================
// gauss/providers/ollama — Ollama (local models) adapter
// =============================================================================

import { createOpenAI } from "@ai-sdk/openai";

export interface OllamaProviderOptions {
  /** Base URL of the Ollama server. Defaults to `http://localhost:11434/v1`. */
  baseURL?: string;
}

/**
 * Create an Ollama provider instance for local model inference.
 *
 * Uses the OpenAI-compatible API exposed by Ollama.
 * No API key required — runs entirely on your machine.
 *
 * @example
 * ```ts
 * import { ollama } from 'gauss/providers'
 * import { agent } from 'gauss'
 *
 * const a = agent({ model: ollama('llama3.2'), instructions: '...' }).build()
 * ```
 */
export function ollama(modelId: string, options?: OllamaProviderOptions) {
  const provider = createOpenAI({
    baseURL: options?.baseURL ?? "http://localhost:11434/v1",
    apiKey: "ollama",
    name: "ollama",
  });
  return provider(modelId);
}
