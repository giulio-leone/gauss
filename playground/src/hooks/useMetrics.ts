import { useMemo } from 'react';
import type { ChatMessage, TimelineEntry, ExecutionMetrics } from '../types';

const COST_PER_1K_PROMPT = 0.003;
const COST_PER_1K_COMPLETION = 0.006;
const AVG_CHARS_PER_TOKEN = 4;

/** Derives execution metrics from timeline entries and messages. */
export function useMetrics(timeline: TimelineEntry[], messages: ChatMessage[]): ExecutionMetrics {
  return useMemo(() => {
    const toolCallCount = timeline.filter((e) => e.type === 'tool_call').length;

    const totalLatencyMs = timeline.reduce(
      (sum, e) => sum + (e.durationMs ?? 0),
      0,
    );

    const promptChars = messages
      .filter((m) => m.role === 'user')
      .reduce((sum, m) => sum + m.content.length, 0);

    const completionChars = messages
      .filter((m) => m.role === 'assistant')
      .reduce((sum, m) => sum + m.content.length, 0);

    const promptTokens = Math.ceil(promptChars / AVG_CHARS_PER_TOKEN);
    const completionTokens = Math.ceil(completionChars / AVG_CHARS_PER_TOKEN);
    const totalTokens = promptTokens + completionTokens;

    const estimatedCost =
      (promptTokens / 1000) * COST_PER_1K_PROMPT +
      (completionTokens / 1000) * COST_PER_1K_COMPLETION;

    return {
      totalTokens,
      promptTokens,
      completionTokens,
      totalLatencyMs,
      toolCallCount,
      estimatedCost,
    };
  }, [timeline, messages]);
}
