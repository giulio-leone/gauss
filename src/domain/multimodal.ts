// =============================================================================
// Multimodal — Image processing and multimodal message types
// =============================================================================

import type { LanguageModel, LanguageModelV2 } from "ai";
import { generateText } from "ai";

// =============================================================================
// Types
// =============================================================================

export type ImageSource =
  | { type: "url"; url: string }
  | { type: "base64"; data: string; mimeType: string }
  | { type: "file"; path: string };

export interface ImageInput {
  source: ImageSource;
  detail?: "auto" | "low" | "high";
}

export interface MultimodalContent {
  type: "text" | "image";
  text?: string;
  image?: ImageInput;
}

export interface MultimodalMessage {
  role: "user" | "assistant" | "system";
  content: MultimodalContent[];
}

export interface MultimodalResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  durationMs: number;
}

// =============================================================================
// MultimodalAgent — Handles text + image inputs
// =============================================================================

export class MultimodalAgent {
  private model: LanguageModel;
  private instructions?: string;

  constructor(config: { model: LanguageModel; instructions?: string }) {
    this.model = config.model;
    this.instructions = config.instructions;
  }

  /** Process a multimodal message (text + images) */
  async process(messages: MultimodalMessage[]): Promise<MultimodalResult> {
    const start = Date.now();

    // Convert to AI SDK format
    const prompt = this.buildPrompt(messages);

    const result = await generateText({
      model: this.model as LanguageModelV2,
      prompt,
      system: this.instructions,
    });

    return {
      text: result.text,
      usage: result.usage
        ? {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          }
        : undefined,
      durationMs: Date.now() - start,
    };
  }

  /** Shortcut: describe a single image */
  async describeImage(
    image: ImageInput,
    prompt?: string
  ): Promise<MultimodalResult> {
    return this.process([
      {
        role: "user",
        content: [
          { type: "image", image },
          {
            type: "text",
            text: prompt ?? "Describe this image in detail.",
          },
        ],
      },
    ]);
  }

  /** Shortcut: extract text from image (OCR) */
  async extractText(image: ImageInput): Promise<MultimodalResult> {
    return this.process([
      {
        role: "user",
        content: [
          { type: "image", image },
          {
            type: "text",
            text: "Extract all visible text from this image. Return only the extracted text, preserving the original formatting as much as possible.",
          },
        ],
      },
    ]);
  }

  /** Shortcut: compare two images */
  async compareImages(
    image1: ImageInput,
    image2: ImageInput,
    prompt?: string
  ): Promise<MultimodalResult> {
    return this.process([
      {
        role: "user",
        content: [
          { type: "image", image: image1 },
          { type: "image", image: image2 },
          {
            type: "text",
            text:
              prompt ??
              "Compare these two images and describe the differences.",
          },
        ],
      },
    ]);
  }

  private buildPrompt(messages: MultimodalMessage[]): string {
    return messages
      .map((msg) =>
        msg.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n")
      )
      .join("\n\n");
  }
}

// =============================================================================
// Factory function
// =============================================================================

export function multimodal(config: {
  model: LanguageModel;
  instructions?: string;
}): MultimodalAgent {
  return new MultimodalAgent(config);
}
