// =============================================================================
// dispatch_subagent tool — Fire-and-forget subagent dispatch
// =============================================================================

import { tool } from "ai";
import { z } from "zod";

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
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDispatchTool(config: DispatchToolConfig) {
  const { registry, parentId, currentDepth } = config;

  return tool({
    description:
      "Dispatch a subtask to a specialized subagent. Returns immediately with a taskId. " +
      "Use poll_subagent to check progress, or await_subagent to wait for completion. " +
      "You can dispatch multiple tasks in a single step for parallel execution.",
    inputSchema: DispatchSubagentInputSchema,
    execute: async (input): Promise<string> => {
      try {
        const handle = registry.dispatch(parentId, currentDepth, {
          prompt: input.prompt,
          instructions: input.instructions,
          priority: input.priority,
          timeoutMs: input.timeoutMs,
          metadata: input.metadata,
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
