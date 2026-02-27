// =============================================================================
// LoggingMiddleware — Structured agent & tool event logging
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeAgentParams,
  AfterAgentParams,
  BeforeToolCallParams,
  AfterToolCallParams,
  OnMiddlewareErrorParams,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";

export interface LoggingMiddlewareOptions {
  /** Custom logger function (defaults to console.log) */
  logger?: (entry: LogEntry) => void;
  /** Include tool args in logs (default: false for security) */
  logToolArgs?: boolean;
  /** Include tool results in logs (default: false) */
  logToolResults?: boolean;
}

export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  event: string;
  sessionId: string;
  agentName?: string;
  data?: Record<string, unknown>;
}

export function createLoggingMiddleware(
  options: LoggingMiddlewareOptions = {},
): MiddlewarePort {
  const log = options.logger ?? ((entry: LogEntry) => {
    const prefix = `[${new Date(entry.timestamp).toISOString()}] [${entry.level}]`;
    // eslint-disable-next-line no-console
    console.log(`${prefix} ${entry.event}`, entry.data ?? "");
  });

  function emit(
    ctx: MiddlewareContext,
    level: LogEntry["level"],
    event: string,
    data?: Record<string, unknown>,
  ): void {
    log({
      timestamp: Date.now(),
      level,
      event,
      sessionId: ctx.sessionId,
      agentName: ctx.agentName,
      data,
    });
  }

  return {
    name: "gauss:logging",
    priority: MiddlewarePriority.LATE,

    beforeAgent(ctx: MiddlewareContext, params: BeforeAgentParams) {
      emit(ctx, "info", "agent:start", {
        promptLength: params.prompt.length,
        toolCount: Object.keys(params.tools).length,
      });
    },

    afterAgent(ctx: MiddlewareContext, params: AfterAgentParams) {
      emit(ctx, "info", "agent:complete", {
        resultLength: params.result.text.length,
        stepCount: params.result.steps.length,
      });
    },

    beforeTool(ctx: MiddlewareContext, params: BeforeToolCallParams) {
      const data: Record<string, unknown> = {
        toolName: params.toolName,
        stepIndex: params.stepIndex,
      };
      if (options.logToolArgs) data.args = params.args;
      emit(ctx, "debug", "tool:start", data);
    },

    afterTool(ctx: MiddlewareContext, params: AfterToolCallParams) {
      const data: Record<string, unknown> = {
        toolName: params.toolName,
        stepIndex: params.stepIndex,
        durationMs: params.durationMs,
      };
      if (options.logToolResults) data.result = params.result;
      emit(ctx, "debug", "tool:complete", data);
    },

    onError(ctx: MiddlewareContext, params: OnMiddlewareErrorParams) {
      emit(ctx, "error", "middleware:error", {
        phase: params.phase,
        middlewareName: params.middlewareName,
        error: params.error instanceof Error
          ? { message: params.error.message, stack: params.error.stack }
          : String(params.error),
      });
    },
  };
}
