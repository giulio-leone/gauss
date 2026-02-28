// =============================================================================
// Gauss LLM Core — Stop Conditions
// Determine when to end multi-step agent loops.
// =============================================================================

import type { StepResult, ToolSet } from "./types.js";

export type StopCondition<TOOLS extends ToolSet = ToolSet> = (options: {
  steps: Array<StepResult<TOOLS>>;
}) => PromiseLike<boolean> | boolean;

/**
 * Stops after exactly `count` steps have been executed.
 */
export function stepCountIs(count: number): StopCondition<ToolSet> {
  return ({ steps }) => steps.length >= count;
}

/**
 * Stops when a specific tool has been called in the latest step.
 */
export function hasToolCall(toolName: string): StopCondition<ToolSet> {
  return ({ steps }) =>
    steps[steps.length - 1]?.toolCalls?.some(
      (tc) => tc.toolName === toolName,
    ) ?? false;
}
