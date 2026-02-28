// =============================================================================
// Checkpoint Decorator — Save/restore agent state
// =============================================================================

import type { Decorator, RunContext, AgentResult } from "../core/agent/types.js";
import type { StepResult } from "../core/llm/types.js";

export interface CheckpointStorage {
  save(sessionId: string, checkpoint: CheckpointData): Promise<void>;
  load(sessionId: string): Promise<CheckpointData | null>;
  list(sessionId: string): Promise<CheckpointData[]>;
  deleteOld(sessionId: string, keepCount: number): Promise<void>;
}

export interface CheckpointData {
  id: string;
  sessionId: string;
  stepIndex: number;
  messages: unknown[];
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface CheckpointConfig {
  storage: CheckpointStorage;
  interval?: number;
  maxCheckpoints?: number;
  sessionId?: string;
}

export function checkpoint(config: CheckpointConfig): Decorator {
  const { storage, interval = 5, maxCheckpoints = 10 } = config;
  let stepCount = 0;

  return {
    name: "checkpoint",

    async beforeRun(ctx: RunContext) {
      const sessionId = config.sessionId ?? (ctx.metadata["sessionId"] as string) ?? "default";
      ctx.metadata["_checkpointSessionId"] = sessionId;

      // Try to restore from latest checkpoint
      const latest = await storage.load(sessionId);
      if (latest) {
        ctx.messages.push(...(latest.messages as typeof ctx.messages));
        Object.assign(ctx.metadata, latest.metadata);
      }

      return ctx;
    },

    async afterStep(ctx, step: StepResult) {
      stepCount++;

      if (stepCount % interval === 0) {
        const sessionId = ctx.metadata["_checkpointSessionId"] as string;
        await storage.save(sessionId, {
          id: `cp_${Date.now()}`,
          sessionId,
          stepIndex: stepCount,
          messages: ctx.messages,
          metadata: { ...ctx.metadata },
          timestamp: Date.now(),
        });
        await storage.deleteOld(sessionId, maxCheckpoints);
      }

      return step;
    },
  };
}
