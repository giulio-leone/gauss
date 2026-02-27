// =============================================================================
// ProcessorPipeline — Input/Output transform chains with retry
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeAgentParams,
  BeforeAgentResult,
  AfterAgentParams,
  AfterAgentResult,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";

// =============================================================================
// Processor interfaces
// =============================================================================

export interface ProcessorResult<T> {
  value: T;
  metadata?: Record<string, unknown>;
}

export interface InputProcessor {
  readonly name: string;
  process(prompt: string, ctx: MiddlewareContext): Promise<ProcessorResult<string>>;
}

export interface OutputProcessor {
  readonly name: string;
  process(text: string, ctx: MiddlewareContext): Promise<ProcessorResult<string>>;
}

// =============================================================================
// Pipeline options
// =============================================================================

export interface ProcessorPipelineOptions {
  /** Input processors — executed in order before agent */
  inputProcessors?: InputProcessor[];
  /** Output processors — executed in order after agent */
  outputProcessors?: OutputProcessor[];
  /** Max retries per processor on failure (default: 0) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 100) */
  retryDelayMs?: number;
}

// =============================================================================
// Pipeline implementation as middleware
// =============================================================================

export function createProcessorPipeline(
  options: ProcessorPipelineOptions,
): MiddlewarePort {
  const maxRetries = options.maxRetries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 100;
  const inputs = options.inputProcessors ?? [];
  const outputs = options.outputProcessors ?? [];

  async function runWithRetry<T>(
    fn: () => Promise<T>,
    processorName: string,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        }
      }
    }
    throw new Error(
      `Processor "${processorName}" failed after ${maxRetries + 1} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  return {
    name: "gauss:processor-pipeline",
    priority: MiddlewarePriority.EARLY,

    async beforeAgent(
      ctx: MiddlewareContext,
      params: BeforeAgentParams,
    ): Promise<BeforeAgentResult | void> {
      if (inputs.length === 0) return;

      let prompt = params.prompt;
      for (const processor of inputs) {
        const result = await runWithRetry(
          () => processor.process(prompt, ctx),
          processor.name,
        );
        prompt = result.value;
        if (result.metadata) {
          Object.assign(ctx.metadata, result.metadata);
        }
      }

      if (prompt !== params.prompt) {
        return { prompt };
      }
    },

    async afterAgent(
      ctx: MiddlewareContext,
      params: AfterAgentParams,
    ): Promise<AfterAgentResult | void> {
      if (outputs.length === 0) return;

      let text = params.result.text;
      for (const processor of outputs) {
        const result = await runWithRetry(
          () => processor.process(text, ctx),
          processor.name,
        );
        text = result.value;
        if (result.metadata) {
          Object.assign(ctx.metadata, result.metadata);
        }
      }

      if (text !== params.result.text) {
        return { text };
      }
    },
  };
}
