// =============================================================================
// AiSdkModelAdapter — Wraps Vercel AI SDK LanguageModel into ModelPort
// =============================================================================

import type { LanguageModel } from "../../core/llm/index.js";
import { generateText, streamText } from "../../core/llm/index.js";

import type {
  ModelPort,
  ModelGenerateOptions,
  ModelGenerateResult,
  ModelStreamResult,
} from "../../ports/model.port.js";

export interface AiSdkModelAdapterOptions {
  model: LanguageModel;
  modelId?: string;
  contextWindowSize?: number;
}

export class AiSdkModelAdapter implements ModelPort {
  private readonly model: LanguageModel;
  private readonly _modelId: string;
  private readonly contextWindow: number;

  constructor(options: AiSdkModelAdapterOptions) {
    this.model = options.model;
    this._modelId = options.modelId ?? (typeof options.model === "string" ? options.model : "unknown");
    this.contextWindow = options.contextWindowSize ?? 128_000;
  }

  getModel(): LanguageModel {
    return this.model;
  }

  getContextWindowSize(): number {
    return this.contextWindow;
  }

  getModelId(): string {
    return this._modelId;
  }

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const result = await generateText({
      model: this.model,
      system: options.systemPrompt,
      messages: options.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
      stopSequences: options.stopSequences,
    });

    return {
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      },
      finishReason: result.finishReason,
    };
  }

  async generateStream(options: ModelGenerateOptions): Promise<ModelStreamResult> {
    const result = streamText({
      model: this.model,
      system: options.systemPrompt,
      messages: options.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
      stopSequences: options.stopSequences,
    });

    const usagePromise: Promise<{ inputTokens: number; outputTokens: number; totalTokens: number }> =
      Promise.resolve(result.usage).then((u) => ({
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        totalTokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
      }));

    return {
      textStream: result.textStream,
      usage: usagePromise,
    };
  }
}
