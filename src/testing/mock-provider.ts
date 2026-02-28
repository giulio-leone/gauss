// =============================================================================
// Mock AI SDK Provider — Canned responses for testing
// =============================================================================

import type { LanguageModel } from "../core/llm/index.js";

export interface MockResponse {
  text: string;
  toolCalls?: Array<{ toolName: string; args: Record<string, unknown> }>;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Creates a mock LanguageModelV3 that returns canned responses in order.
 * Compatible with AI SDK v6's ToolLoopAgent.
 */
export function createMockProvider(responses: MockResponse[]): LanguageModel {
  const queue = [...responses];
  let callIndex = 0;

  function nextResponse(): MockResponse {
    const response = queue[callIndex] ?? queue[queue.length - 1];
    if (!response) {
      throw new Error("MockProvider: no responses configured");
    }
    callIndex++;
    return response;
  }

  const model = {
    specificationVersion: "v3",
    provider: "mock-provider",
    modelId: "mock-model",
    defaultObjectGenerationMode: "json",

    async doGenerate(options: unknown) {
      const resp = nextResponse();
      const usage = resp.usage ?? { inputTokens: 10, outputTokens: 20 };

      const toolCalls = resp.toolCalls?.map((tc, i) => ({
        toolCallType: "function" as const,
        toolCallId: `call_${callIndex - 1}_${i}`,
        toolName: tc.toolName,
        args: JSON.stringify(tc.args),
      }));

      return {
        text: resp.text,
        toolCalls: toolCalls ?? [],
        finishReason: (toolCalls && toolCalls.length > 0 ? "tool-calls" : "stop") as "stop" | "tool-calls",
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
        rawCall: { rawPrompt: null, rawSettings: {} },
        rawResponse: { headers: {} },
        warnings: [],
        request: { body: "" },
        response: {
          id: `resp_${callIndex - 1}`,
          timestamp: new Date(),
          modelId: "mock-model",
        },
        providerMetadata: {},
        sources: [],
        reasoning: undefined,
      };
    },

    async doStream(options: unknown) {
      const resp = nextResponse();
      const usage = resp.usage ?? { inputTokens: 10, outputTokens: 20 };

      const toolCalls = resp.toolCalls?.map((tc, i) => ({
        toolCallType: "function" as const,
        toolCallId: `call_${callIndex - 1}_${i}`,
        toolName: tc.toolName,
        args: JSON.stringify(tc.args),
      }));

      const parts: Array<Record<string, unknown>> = [];

      if (resp.text) {
        parts.push({ type: "text-delta", textDelta: resp.text });
      }

      if (toolCalls) {
        for (const tc of toolCalls) {
          parts.push({
            type: "tool-call",
            toolCallType: tc.toolCallType,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.args,
          });
        }
      }

      parts.push({
        type: "finish",
        finishReason: toolCalls && toolCalls.length > 0 ? "tool-calls" : "stop",
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      });

      const stream = new ReadableStream({
        start(controller) {
          for (const part of parts) {
            controller.enqueue(part);
          }
          controller.close();
        },
      });

      return {
        stream,
        rawCall: { rawPrompt: null, rawSettings: {} },
        rawResponse: { headers: {} },
        warnings: [],
        request: { body: "" },
      };
    },
  };

  return model as unknown as LanguageModel;
}
