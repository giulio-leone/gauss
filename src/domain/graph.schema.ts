// =============================================================================
// Graph Schema — Configuration & result types for AgentGraph
// =============================================================================

import { z } from "zod";

export const GraphConfigSchema = z.object({
  maxDepth: z.number().default(10),
  maxConcurrency: z.number().default(5),
  timeoutMs: z.number().default(600_000),
  maxTokenBudget: z.number().default(1_000_000),
});

export type GraphConfig = z.infer<typeof GraphConfigSchema>;

export const NodeConfigSchema = z.object({
  id: z.string(),
  type: z.enum(["agent", "graph"]),
});

export type NodeConfig = z.infer<typeof NodeConfigSchema>;

export const NodeResultSchema = z.object({
  nodeId: z.string(),
  output: z.string(),
  tokenUsage: z
    .object({
      input: z.number(),
      output: z.number(),
    })
    .optional(),
  durationMs: z.number(),
});

export type NodeResultValue = z.infer<typeof NodeResultSchema>;

export const GraphResultSchema = z.object({
  output: z.string(),
  nodeResults: z.record(z.string(), NodeResultSchema),
  totalDurationMs: z.number(),
  totalTokenUsage: z.object({
    input: z.number(),
    output: z.number(),
  }),
});

export type GraphResult = z.infer<typeof GraphResultSchema>;

export type GraphStreamEvent =
  | { type: "graph:start"; nodeCount: number }
  | { type: "node:start"; nodeId: string }
  | { type: "node:complete"; nodeId: string; result: NodeResultValue }
  | { type: "node:error"; nodeId: string; error: string }
  | { type: "fork:start"; forkId: string; agentCount: number }
  | { type: "fork:complete"; forkId: string; results: NodeResultValue[] }
  | { type: "fork:partial"; forkId: string; completedCount: number; totalCount: number; partialResults: NodeResultValue[] }
  | { type: "consensus:start"; forkId: string }
  | { type: "consensus:result"; forkId: string; output: string }
  | { type: "graph:complete"; result: GraphResult }
  | { type: "graph:error"; error: string; partialResults: Record<string, NodeResultValue> }
  | { type: "pool:metrics"; metrics: { activeWorkers: number; idleWorkers: number; queueDepth: number; totalCompleted: number; totalFailed: number } }
  | { type: "budget:warning"; remaining: number; used: number; threshold: "soft" | "hard" }
  | { type: "backpressure:active"; queueDepth: number; action: "slowdown" | "pause" }
  | { type: "checkpoint:saved"; checkpoint: string; completedCount: number }
  | { type: "node:throttled"; nodeId: string; delayMs: number; reason: string }
  | { type: "node:scheduled"; nodeId: string; queuePosition: number };
