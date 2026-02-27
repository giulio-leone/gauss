// =============================================================================
// await_subagent tool — Blocking wait for subagent completion
// =============================================================================

import { tool } from "ai";
import { z } from "zod";

import type { DelegationHooks } from "../../types.js";
import type { SubagentRegistry } from "./subagent-registry.js";
import { isTerminalStatus } from "./subagent-registry.js";

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
  pollIntervalMs: z
    .number()
    .int()
    .min(50)
    .max(5_000)
    .default(200)
    .describe("Polling interval used for optional completion checks"),
});

export type AwaitSubagentInput = z.infer<typeof AwaitSubagentInputSchema>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AwaitToolConfig {
  registry: SubagentRegistry;
  hooks?: DelegationHooks;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAwaitTool(config: AwaitToolConfig) {
  const { registry, hooks } = config;

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const normalizeCompletionResult = (
    result: Awaited<ReturnType<NonNullable<DelegationHooks["isTaskComplete"]>>>,
  ): { isComplete: boolean; reason?: string } => {
    if (typeof result === "boolean") {
      return { isComplete: result };
    }
    if (!result) {
      return { isComplete: false };
    }
    return {
      isComplete: result.isComplete,
      reason: result.reason,
    };
  };

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

          let completionOverride = false;
          let completionReason: string | undefined;
          let resolved = handle;

          if (!hooks?.isTaskComplete) {
            resolved = await registry.waitForCompletion(
              taskId,
              input.timeoutMs,
            );
          } else {
            const startedAt = Date.now();
            let iterations = 0;
            while (Date.now() - startedAt < input.timeoutMs) {
              const current = registry.get(taskId);
              if (!current) {
                return {
                  taskId,
                  status: "not_found" as const,
                  error:
                    "Task not found. It may have been garbage collected.",
                };
              }

              resolved = current;
              if (isTerminalStatus(current.status)) {
                break;
              }

              try {
                const decision = normalizeCompletionResult(
                  await hooks.isTaskComplete({
                    taskId: current.taskId,
                    parentId: current.parentId,
                    status: current.status,
                    partialOutput: current.partialOutput,
                    finalOutput: current.finalOutput,
                    error: current.error,
                    elapsedMs: Date.now() - current.createdAt,
                    iterations,
                    tokenUsage: current.tokenUsage,
                    metadata: current.metadata,
                  }),
                );

                if (decision.isComplete) {
                  completionOverride = true;
                  completionReason = decision.reason;
                  break;
                }
              } catch {
                // Ignore hook errors and continue waiting with default behavior.
              }

              iterations++;
              await wait(input.pollIntervalMs);
            }
          }

          const response: {
            taskId: string;
            status: string;
            output?: string;
            error?: string;
            durationMs: number;
            tokenUsage: { input: number; output: number };
            completionOverride?: boolean;
            completionReason?: string;
          } = {
            taskId: resolved.taskId,
            status: resolved.status,
            output: resolved.finalOutput ?? undefined,
            error: resolved.error ?? undefined,
            durationMs: Date.now() - resolved.createdAt,
            tokenUsage: resolved.tokenUsage,
          };

          if (completionOverride) {
            response.completionOverride = true;
            if (completionReason) {
              response.completionReason = completionReason;
            }
          }

          return response;
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
