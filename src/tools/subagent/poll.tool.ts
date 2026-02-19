// =============================================================================
// poll_subagent tool — Non-blocking status check for dispatched subagents
// =============================================================================

import { tool } from "ai";
import { z } from "zod";

import type { SubagentRegistry } from "./subagent-registry.js";

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

export const PollSubagentInputSchema = z.object({
  taskIds: z
    .array(z.string())
    .min(1)
    .max(50)
    .describe("Task IDs to check status for"),
  includePartialOutput: z
    .boolean()
    .default(true)
    .describe("Whether to include partial output from streaming tasks"),
  maxPartialOutputLength: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(2_000)
    .describe("Maximum characters of partial output to return per task"),
});

export type PollSubagentInput = z.infer<typeof PollSubagentInputSchema>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PollToolConfig {
  registry: SubagentRegistry;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPollTool(config: PollToolConfig) {
  const { registry } = config;

  return tool({
    description:
      "Check the status of dispatched subtasks. Returns current status and partial output. " +
      "Never blocks — returns immediately.",
    inputSchema: PollSubagentInputSchema,
    execute: async (input): Promise<string> => {
      const summary = {
        total: 0,
        queued: 0,
        running: 0,
        streaming: 0,
        completed: 0,
        failed: 0,
        timeout: 0,
        cancelled: 0,
      };

      const tasks = input.taskIds.map((taskId) => {
        summary.total++;
        const handle = registry.get(taskId);
        if (!handle) {
          return {
            taskId,
            status: "not_found",
            error: "Task not found",
            durationMs: 0,
          };
        }

        const status = handle.status;
        if (status in summary) (summary as any)[status]++;

        const result: Record<string, unknown> = {
          taskId,
          status,
          durationMs: Date.now() - handle.createdAt,
        };

        if (
          input.includePartialOutput &&
          (status === "streaming" || status === "running") &&
          handle.partialOutput
        ) {
          result.partialOutput = handle.partialOutput.slice(
            -input.maxPartialOutputLength,
          );
        }

        if (status === "completed" && handle.finalOutput) {
          result.finalOutput = handle.finalOutput;
        }

        if (
          (status === "failed" ||
            status === "timeout" ||
            status === "cancelled") &&
          handle.error
        ) {
          result.error = handle.error;
        }

        if (
          handle.tokenUsage.input > 0 ||
          handle.tokenUsage.output > 0
        ) {
          result.tokenUsage = handle.tokenUsage;
        }

        return result;
      });

      return JSON.stringify({ tasks, summary }, null, 2);
    },
  });
}
