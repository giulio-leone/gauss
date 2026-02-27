// =============================================================================
// ObservationalMemoryMiddleware — Summarization at token thresholds
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  AfterAgentParams,
  AfterAgentResult,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";

export interface ObservationalMemoryOptions {
  /** Token threshold fraction (0-1) to trigger summarization (default: 0.7) */
  thresholdFraction?: number;
  /** Max context tokens */
  maxTokens?: number;
  /** Summarization function */
  summarize: (text: string) => Promise<string>;
  /** Persistence callback */
  onSummarize?: (summary: string, metadata: ObservationMetadata) => Promise<void>;
}

export interface ObservationMetadata {
  currentTask?: string;
  suggestedResponse?: string;
  lastObservedAt: number;
  messageCount: number;
  tokenEstimate: number;
}

export function createObservationalMemoryMiddleware(
  options: ObservationalMemoryOptions,
): MiddlewarePort {
  const threshold = options.thresholdFraction ?? 0.7;
  const maxTokens = options.maxTokens ?? 128_000;
  let messageCount = 0;
  let totalEstimatedTokens = 0;

  return {
    name: "gauss:observational-memory",
    priority: MiddlewarePriority.LATE,

    async afterAgent(
      _ctx: MiddlewareContext,
      params: AfterAgentParams,
    ): Promise<AfterAgentResult | void> {
      messageCount++;
      // Rough token estimate: ~4 chars per token
      const responseTokens = Math.ceil(params.result.text.length / 4);
      totalEstimatedTokens += responseTokens;

      if (totalEstimatedTokens > maxTokens * threshold) {
        const summary = await options.summarize(params.result.text);

        const metadata: ObservationMetadata = {
          lastObservedAt: Date.now(),
          messageCount,
          tokenEstimate: totalEstimatedTokens,
        };

        await options.onSummarize?.(summary, metadata);

        // Reset counters after summarization
        totalEstimatedTokens = Math.ceil(summary.length / 4);
        messageCount = 0;

        return { text: summary };
      }
    },
  };
}
