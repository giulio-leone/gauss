// =============================================================================
// ApproximateTokenCounter — Char-based token estimation
// =============================================================================

import type { Message } from "../../types.js";
import type { TokenCounterPort } from "../../ports/token-counter.port.js";

const CHARS_PER_TOKEN = 4;
const ROLE_OVERHEAD_TOKENS = 4;

const CONTEXT_WINDOW_SIZES: Record<string, number> = {
  "gpt-5.2": 128_000,
  "gpt-5.2-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  "claude-3.5-sonnet": 200_000,
  "claude-3-sonnet": 200_000,
  "claude-3-haiku": 200_000,
  "claude-3-opus": 200_000,
  "claude-4-sonnet": 200_000,
  "gemini-2.5-flash-preview-05-20": 1_000_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.5-pro": 1_000_000,
  "gemini-1.5-flash": 1_000_000,
  "gemini-1.5-pro": 2_000_000,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

// Cost per 1M tokens (USD): [input, output]
const COST_TABLE: Record<string, [number, number]> = {
  "gpt-5.2": [2.5, 10],
  "gpt-5.2-mini": [0.15, 0.6],
  "claude-3.5-sonnet": [3, 15],
  "claude-3-haiku": [0.25, 1.25],
  "gemini-2.5-flash-preview-05-20": [0.075, 0.3],
  "gemini-2.5-flash": [0.15, 0.6],
  "gemini-2.5-pro": [1.25, 10],
};

const DEFAULT_COST: [number, number] = [1, 3];

export class ApproximateTokenCounter implements TokenCounterPort {
  count(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  countMessages(messages: Message[]): number {
    if (!messages.length) return 0;
    return messages.reduce(
      (sum, msg) => sum + this.count(msg.content) + ROLE_OVERHEAD_TOKENS,
      0,
    );
  }

  getContextWindowSize(model: string): number {
    return CONTEXT_WINDOW_SIZES[model] ?? DEFAULT_CONTEXT_WINDOW;
  }

  estimateCost(
    inputTokens: number,
    outputTokens: number,
    model: string,
  ): number {
    const [inputRate, outputRate] = COST_TABLE[model] ?? DEFAULT_COST;
    return (
      (inputTokens / 1_000_000) * inputRate +
      (outputTokens / 1_000_000) * outputRate
    );
  }

  truncate(text: string, maxTokens: number): string {
    if (!text) return text;
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars);
  }
}
