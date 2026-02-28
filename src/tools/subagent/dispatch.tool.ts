// =============================================================================
// dispatch_subagent tool — Fire-and-forget subagent dispatch
// =============================================================================

import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { DelegationHooks } from "../../types.js";
import type { SubagentRegistry } from "./subagent-registry.js";
import {
  SubagentQueueFullError,
  SubagentDepthExceededError,
  SubagentQuotaExceededError,
} from "./subagent-registry.js";

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

export const DispatchSubagentInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(10_000)
    .describe("Task description for the subagent"),
  instructions: z
    .string()
    .max(5_000)
    .optional()
    .describe("Optional system instructions for the subagent"),
  priority: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Priority (1=highest, 10=lowest). Default: 5"),
  timeoutMs: z
    .number()
    .int()
    .min(5_000)
    .max(600_000)
    .optional()
    .describe("Timeout in milliseconds. Default: 300000 (5 min)"),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional metadata to pass to the subagent"),
});

export type DispatchSubagentInput = z.infer<typeof DispatchSubagentInputSchema>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface DispatchToolConfig {
  registry: SubagentRegistry;
  parentId: string;
  currentDepth: number;
  hooks?: DelegationHooks;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDispatchTool(config: DispatchToolConfig) {
  const { registry, parentId, currentDepth, hooks } = config;

  return tool({
    description:
      "Dispatch a subtask to a specialized subagent. Returns immediately with a taskId. " +
      "Use poll_subagent to check progress, or await_subagent to wait for completion. " +
      "You can dispatch multiple tasks in a single step for parallel execution.",
    inputSchema: DispatchSubagentInputSchema,
    execute: async (input): Promise<string> => {
      try {
        let prompt = input.prompt;
        let instructions = input.instructions;
        let priority = input.priority;
        let timeoutMs = input.timeoutMs;
        let metadata = input.metadata;

        if (hooks?.onDelegationStart) {
          const hookResult = await hooks.onDelegationStart({
            parentId,
            currentDepth,
            prompt,
            instructions,
            priority,
            timeoutMs,
            metadata,
          });

          if (hookResult?.allow === false) {
            return JSON.stringify({
              blocked: true,
              error:
                hookResult.reason ??
                "Delegation blocked by supervisor hook",
            });
          }

          if (hookResult?.prompt !== undefined) {
            prompt = hookResult.prompt;
          }
          if (hookResult?.instructions !== undefined) {
            instructions = hookResult.instructions;
          }
          if (hookResult?.priority !== undefined) {
            priority = hookResult.priority;
          }
          if (hookResult?.timeoutMs !== undefined) {
            timeoutMs = hookResult.timeoutMs;
          }
          if (hookResult?.metadata !== undefined) {
            metadata = hookResult.metadata;
          }
        }

        const handle = registry.dispatch(parentId, currentDepth, {
          prompt,
          instructions,
          priority,
          timeoutMs,
          metadata,
        });

        return JSON.stringify({
          taskId: handle.taskId,
          status: "queued",
          queuePosition: registry.queuedCount,
          message:
            "Task dispatched. Use poll_subagent or await_subagent to get results.",
        });
      } catch (error: unknown) {
        if (
          error instanceof SubagentQueueFullError ||
          error instanceof SubagentDepthExceededError ||
          error instanceof SubagentQuotaExceededError
        ) {
          return JSON.stringify({ error: error.message });
        }
        const msg =
          error instanceof Error ? error.message : String(error);
        return JSON.stringify({ error: `Dispatch failed: ${msg}` });
      }
    },
  });
}
