// =============================================================================
// Gauss Agent Core — stream() Implementation
// Streaming agent execution with decorator lifecycle.
// =============================================================================

import type {
  AgentConfig,
  AgentResult,
  AgentStream,
  Decorator,
  RunContext,
  RunOptions,
  StreamChunk,
} from "./types.js";
import type { CoreMessage, TokenUsage } from "../llm/types.js";
import { streamText } from "../llm/stream-text.js";

/**
 * Execute a streaming agent run with decorator lifecycle.
 * Returns an AgentStream that is both async-iterable and has promise accessors.
 */
export function streamAgent(
  config: AgentConfig,
  decorators: ReadonlyArray<Decorator>,
  prompt: string,
  options?: RunOptions,
  initPromise?: Promise<void>,
): AgentStream {
  const startTime = performance.now();
  const abortController = new AbortController();

  // Deferred result
  let resolveResult: (r: AgentResult) => void;
  let rejectResult: (e: Error) => void;
  const resultPromise = new Promise<AgentResult>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  let resolveText: (t: string) => void;
  const textPromise = new Promise<string>((res) => {
    resolveText = res;
  });

  let resolveUsage: (u: TokenUsage) => void;
  const usagePromise = new Promise<TokenUsage>((res) => {
    resolveUsage = res;
  });

  // The async generator that yields chunks
  async function* generateChunks(): AsyncGenerator<StreamChunk> {
    // Wait for initialization
    if (initPromise) await initPromise;

    // Build context
    let ctx = buildRunContext(config, prompt, options, abortController.signal);

    // Execute beforeRun (FIFO)
    for (const d of decorators) {
      if (d.beforeRun) {
        const result = await d.beforeRun(ctx);
        if (result) ctx = result;
      }
    }

    try {
      const outputSpec = ctx.options.output ?? config.output;

      const streamResult = await streamText({
        model: config.model,
        system: config.instructions,
        prompt: ctx.prompt,
        tools: config.tools,
        maxSteps: ctx.options.maxSteps ?? config.maxSteps ?? 10,
        output: outputSpec ? { schema: outputSpec.schema } : undefined,
        abortSignal: abortController.signal,
      });

      let fullText = "";

      // Yield text chunks from the stream
      const reader = streamResult.textStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += value;
          yield { text: value };
        }
      } finally {
        reader.releaseLock();
      }

      // Resolve promises with final values
      const [text, usage, toolCalls, toolResults, finishReason, steps] = await Promise.all([
        streamResult.text,
        streamResult.usage,
        streamResult.toolCalls,
        streamResult.toolResults,
        streamResult.finishReason,
        streamResult.steps,
      ]);

      resolveText(text);
      resolveUsage(usage);

      let agentResult: AgentResult = {
        text,
        output: text as never,
        steps,
        toolCalls,
        toolResults,
        usage,
        finishReason,
        duration: performance.now() - startTime,
        messages: ctx.messages,
      };

      // Execute afterRun (LIFO)
      for (let i = decorators.length - 1; i >= 0; i--) {
        const d = decorators[i];
        if (d.afterRun) {
          agentResult = await d.afterRun(ctx, agentResult);
        }
      }

      resolveResult(agentResult);
    } catch (error) {
      for (const d of decorators) {
        if (d.onError) {
          await d.onError(error as Error, ctx);
        }
      }
      rejectResult!(error as Error);
      throw error;
    }
  }

  // Build the AgentStream object
  const chunks = generateChunks();

  const stream: AgentStream = {
    [Symbol.asyncIterator]() {
      return chunks;
    },

    get text() {
      return textPromise;
    },

    get result() {
      return resultPromise;
    },

    get usage() {
      return usagePromise;
    },

    abort() {
      abortController.abort();
    },
  };

  return stream;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRunContext(
  config: AgentConfig,
  prompt: string,
  options?: RunOptions,
  abortSignal?: AbortSignal,
): RunContext {
  return {
    config,
    prompt,
    options: options ?? {},
    messages: [] as CoreMessage[],
    metadata: options?.metadata ?? {},
    abortSignal,
  };
}
