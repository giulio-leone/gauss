// =============================================================================
// Gauss Agent Core — run() Implementation
// Executes generateText with full decorator lifecycle.
// =============================================================================

import type {
  AgentConfig,
  AgentResult,
  Decorator,
  RunContext,
  RunOptions,
  StepContext,
  ToolCallContext,
} from "./types.js";
import type { CoreMessage, StepResult, ToolResult } from "../llm/types.js";
import { generateText } from "../llm/generate-text.js";

/**
 * Execute an agent run with decorator lifecycle hooks.
 *
 * Lifecycle order:
 *   beforeRun (FIFO) → generateText (with step/tool hooks) → afterRun (LIFO)
 */
export async function runAgent(
  config: AgentConfig,
  decorators: ReadonlyArray<Decorator>,
  prompt: string,
  options?: RunOptions,
): Promise<AgentResult> {
  const startTime = performance.now();

  // Build initial context
  let ctx = buildRunContext(config, prompt, options);

  // Execute beforeRun (FIFO order)
  for (const d of decorators) {
    if (d.beforeRun) {
      const result = await d.beforeRun(ctx);
      if (result) ctx = result;
    }
  }

  try {
    // Build messages
    const messages: CoreMessage[] = [];
    if (ctx.options.messages) {
      messages.push(...ctx.options.messages);
    }

    // Resolve output spec (per-run overrides config)
    const outputSpec = ctx.options.output ?? config.output;

    // Call generateText
    const generateResult = await generateText({
      model: config.model,
      system: config.instructions,
      prompt: ctx.prompt,
      tools: config.tools,
      maxSteps: ctx.options.maxSteps ?? config.maxSteps ?? 10,
      output: outputSpec
        ? { schema: outputSpec.schema }
        : undefined,
      abortSignal: ctx.abortSignal,
    });

    // Build AgentResult
    let agentResult: AgentResult = {
      text: generateResult.text,
      output: generateResult.text as never,
      steps: generateResult.steps,
      toolCalls: generateResult.toolCalls,
      toolResults: generateResult.toolResults,
      usage: generateResult.usage,
      finishReason: generateResult.finishReason,
      duration: performance.now() - startTime,
      messages: ctx.messages,
    };

    // Execute afterRun (LIFO order)
    for (let i = decorators.length - 1; i >= 0; i--) {
      const d = decorators[i];
      if (d.afterRun) {
        agentResult = await d.afterRun(ctx, agentResult);
      }
    }

    return agentResult;
  } catch (error) {
    // Execute onError hooks
    for (const d of decorators) {
      if (d.onError) {
        await d.onError(error as Error, ctx);
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRunContext(
  config: AgentConfig,
  prompt: string,
  options?: RunOptions,
): RunContext {
  return {
    config,
    prompt,
    options: options ?? {},
    messages: [],
    metadata: options?.metadata ?? {},
    abortSignal: options?.abortSignal,
  };
}
