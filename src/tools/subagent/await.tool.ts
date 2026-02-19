// =============================================================================
// await_subagent tool — Blocking wait for subagent completion
// =============================================================================

import { tool } from "ai";
import { z } from "zod";

import type { SubagentRegistry } from "./subagent-registry.js";

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

export const AwaitSubagentInputSchema = z.object({
  taskIds: z
    .array(z.string())
    .min(1)
    .max(50)
    .describe("Task IDs to wait for"),
  timeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(600_000)
    .default(60_000)
    .describe("Maximum time to wait in milliseconds. Default: 60000"),
});

export type AwaitSubagentInput = z.infer<typeof AwaitSubagentInputSchema>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AwaitToolConfig {
  registry: SubagentRegistry;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAwaitTool(config: AwaitToolConfig) {
  const { registry } = config;

  return tool({
    description:
      "Wait for one or more subtasks to complete. Blocks until all are done, timed out, or cancelled. " +
      "Returns partial results if timeout is reached. Use poll_subagent for non-blocking checks.",
    inputSchema: AwaitSubagentInputSchema,
    execute: async (input): Promise<string> => {
      const results = await Promise.allSettled(
        input.taskIds.map(async (taskId) => {
          const handle = registry.get(taskId);
          if (!handle) {
            return {
              taskId,
              status: "not_found" as const,
              error:
                "Task not found. It may have been garbage collected.",
            };
          }

          const resolved = await registry.waitForCompletion(
            taskId,
            input.timeoutMs,
          );

          return {
            taskId: resolved.taskId,
            status: resolved.status,
            output: resolved.finalOutput ?? undefined,
            error: resolved.error ?? undefined,
            durationMs: Date.now() - resolved.createdAt,
            tokenUsage: resolved.tokenUsage,
          };
        }),
      );

      const formatted = results.map((r) => {
        if (r.status === "fulfilled") return r.value;
        return {
          status: "error",
          error:
            r.reason instanceof Error
              ? r.reason.message
              : String(r.reason),
        };
      });

      return JSON.stringify(formatted, null, 2);
    },
  });
}
