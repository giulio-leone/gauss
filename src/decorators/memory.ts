// =============================================================================
// Memory Decorator — Injects conversation history and user memories
// =============================================================================

import type { Decorator, RunContext, AgentResult } from "../core/agent/types.js";

export interface MemoryPort {
  saveConversation(sessionId: string, messages: unknown[]): Promise<void>;
  loadConversation(sessionId: string): Promise<unknown[]>;
  saveMetadata(sessionId: string, key: string, value: unknown): Promise<void>;
  loadMetadata<T>(sessionId: string, key: string): Promise<T | null>;
}

export interface MemoryDecoratorConfig {
  backend: MemoryPort;
  sessionId?: string;
  maxMessages?: number;
}

export function memory(config: MemoryDecoratorConfig): Decorator {
  const { backend, maxMessages = 100 } = config;

  return {
    name: "memory",

    async beforeRun(ctx: RunContext) {
      const sessionId = config.sessionId ?? (ctx.metadata["sessionId"] as string) ?? "default";
      ctx.metadata["sessionId"] = sessionId;

      const history = await backend.loadConversation(sessionId);
      if (history && history.length > 0) {
        const recent = history.slice(-maxMessages);
        ctx.messages.push(...(recent as typeof ctx.messages));
      }

      return ctx;
    },

    async afterRun(ctx: RunContext, result: AgentResult) {
      const sessionId = ctx.metadata["sessionId"] as string ?? "default";

      await backend.saveConversation(sessionId, [
        { role: "user", content: ctx.prompt },
        { role: "assistant", content: result.text },
      ]);

      return result;
    },
  };
}
