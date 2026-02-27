// =============================================================================
// Summarization Middleware — Context management with configurable triggers
// =============================================================================

import type { MiddlewarePort, MiddlewareContext } from "../ports/middleware.port.js";

export interface SummarizationConfig {
  /** Token fraction threshold to trigger (default 0.85) */
  fractionThreshold?: number;
  /** Absolute token count threshold */
  tokenThreshold?: number;
  /** Message count threshold */
  messageThreshold?: number;
  /** Summarizer function: take messages, return summary */
  summarize: (messages: string[]) => Promise<string>;
  /** Estimate token count for a string */
  estimateTokens?: (text: string) => number;
  /** Max context tokens (default 128000) */
  maxContextTokens?: number;
}

function defaultEstimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class SummarizationMiddleware implements MiddlewarePort {
  readonly name = "summarization";
  readonly priority = 50; // EARLY — run before most other middleware

  private config: Required<Omit<SummarizationConfig, "tokenThreshold" | "messageThreshold">> & Pick<SummarizationConfig, "tokenThreshold" | "messageThreshold">;

  constructor(config: SummarizationConfig) {
    this.config = {
      fractionThreshold: config.fractionThreshold ?? 0.85,
      tokenThreshold: config.tokenThreshold,
      messageThreshold: config.messageThreshold,
      summarize: config.summarize,
      estimateTokens: config.estimateTokens ?? defaultEstimateTokens,
      maxContextTokens: config.maxContextTokens ?? 128_000,
    };
  }

  async beforeAgent(params: { prompt: string; instructions?: string; tools?: unknown[] }, context: MiddlewareContext) {
    const messages = context.metadata?.messages as string[] | undefined;
    if (!messages || messages.length === 0) return { action: "continue" as const, params };

    const shouldSummarize = this.shouldTrigger(messages);
    if (!shouldSummarize) return { action: "continue" as const, params };

    // Summarize older messages, keep recent ones
    const keepCount = Math.max(2, Math.floor(messages.length * 0.2));
    const toSummarize = messages.slice(0, messages.length - keepCount);
    if (toSummarize.length === 0) return { action: "continue" as const, params };
    const kept = messages.slice(messages.length - keepCount);

    const summary = await this.config.summarize(toSummarize);
    const newMessages = [`[Summary of ${toSummarize.length} previous messages]: ${summary}`, ...kept];
    context.metadata.messages = newMessages;

    return { action: "continue" as const, params };
  }

  async afterAgent(result: unknown) {
    return result;
  }

  private shouldTrigger(messages: string[]): boolean {
    // Message count threshold
    if (this.config.messageThreshold && messages.length >= this.config.messageThreshold) return true;

    // Token thresholds
    const totalTokens = messages.reduce((sum, m) => sum + this.config.estimateTokens(m), 0);

    if (this.config.tokenThreshold && totalTokens >= this.config.tokenThreshold) return true;

    const fraction = totalTokens / this.config.maxContextTokens;
    if (fraction >= this.config.fractionThreshold) return true;

    return false;
  }
}
