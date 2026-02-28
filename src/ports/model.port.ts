// =============================================================================
// ModelPort — LLM invocation abstraction contract
// =============================================================================

import type { LanguageModel } from "../core/llm/index.js";
import type { Message } from "../types.js";

export interface ModelGenerateOptions {
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface ModelGenerateResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface ModelStreamResult {
  textStream: AsyncIterable<string>;
  usage: Promise<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}

export interface ModelPort {
  /** Get the underlying AI SDK model instance */
  getModel(): LanguageModel;

  /** Get the context window size for the current model */
  getContextWindowSize(): number;

  /** Get the model identifier */
  getModelId(): string;

  /** Generate text (non-streaming) */
  generate(options: ModelGenerateOptions): Promise<ModelGenerateResult>;

  /** Generate text with streaming (optional — not all adapters support it) */
  generateStream?(options: ModelGenerateOptions): Promise<ModelStreamResult>;
}
