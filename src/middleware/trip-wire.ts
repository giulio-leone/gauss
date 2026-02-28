// =============================================================================
// TripWire Middleware — Execution safety controls
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeAgentParams,
  BeforeAgentResult,
  AfterAgentParams,
  AfterAgentResult,
  BeforeToolCallParams,
  BeforeToolCallResult,
  AfterToolCallParams,
  AfterToolCallResult,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";

export interface TripWireOptions {
  /** Max total tokens (prompt + completion) across all steps. */
  maxTokens?: number;
  /** Max wall-clock time in milliseconds. */
  maxTimeMs?: number;
  /** Max USD cost across all LLM calls. */
  maxCostUsd?: number;
  /** Max number of tool calls. */
  maxToolCalls?: number;
  /** Max number of agent steps (iterations). */
  maxSteps?: number;
  /** Callback when a wire is tripped. */
  onTrip?: (wire: TripWireViolation) => void;
}

export interface TripWireViolation {
  wire: "tokens" | "time" | "cost" | "toolCalls" | "steps";
  limit: number;
  actual: number;
}

interface TripWireState {
  totalTokens: number;
  startTime: number;
  totalCostUsd: number;
  toolCallCount: number;
  stepCount: number;
}

export function createTripWireMiddleware(
  options: TripWireOptions = {},
): MiddlewarePort & { stats(): TripWireState; reset(): void } {
  let state: TripWireState = {
    totalTokens: 0,
    startTime: Date.now(),
    totalCostUsd: 0,
    toolCallCount: 0,
    stepCount: 0,
  };

  function checkWires(): TripWireViolation | null {
    if (options.maxTokens && state.totalTokens > options.maxTokens) {
      return { wire: "tokens", limit: options.maxTokens, actual: state.totalTokens };
    }
    if (options.maxTimeMs && Date.now() - state.startTime > options.maxTimeMs) {
      return { wire: "time", limit: options.maxTimeMs, actual: Date.now() - state.startTime };
    }
    if (options.maxCostUsd && state.totalCostUsd > options.maxCostUsd) {
      return { wire: "cost", limit: options.maxCostUsd, actual: state.totalCostUsd };
    }
    if (options.maxToolCalls && state.toolCallCount > options.maxToolCalls) {
      return { wire: "toolCalls", limit: options.maxToolCalls, actual: state.toolCallCount };
    }
    if (options.maxSteps && state.stepCount > options.maxSteps) {
      return { wire: "steps", limit: options.maxSteps, actual: state.stepCount };
    }
    return null;
  }

  const middleware: MiddlewarePort & { stats(): TripWireState; reset(): void } = {
    name: "gauss:trip-wire",
    priority: MiddlewarePriority.FIRST,

    beforeAgent(
      _ctx: MiddlewareContext,
      _params: BeforeAgentParams,
    ): BeforeAgentResult | void {
      state.stepCount++;
      state.startTime = state.startTime || Date.now();
      const violation = checkWires();
      if (violation) {
        options.onTrip?.(violation);
        return {
          abort: true,
          earlyResult: `[TripWire] Execution halted: ${violation.wire} limit exceeded (${violation.actual}/${violation.limit})`,
        };
      }
    },

    beforeTool(
      _ctx: MiddlewareContext,
      _params: BeforeToolCallParams,
    ): BeforeToolCallResult | void {
      state.toolCallCount++;
      const violation = checkWires();
      if (violation) {
        options.onTrip?.(violation);
        return {
          skip: true,
          mockResult: `[TripWire] Tool call skipped: ${violation.wire} limit exceeded (${violation.actual}/${violation.limit})`,
        };
      }
    },

    afterTool(
      _ctx: MiddlewareContext,
      params: AfterToolCallParams,
    ): AfterToolCallResult | void {
      // Track tokens from tool result metadata if available
      const meta = params.result as { tokens?: number; costUsd?: number } | null;
      if (meta?.tokens) state.totalTokens += meta.tokens;
      if (meta?.costUsd) state.totalCostUsd += meta.costUsd;
    },

    afterAgent(
      _ctx: MiddlewareContext,
      params: AfterAgentParams,
    ): AfterAgentResult | void {
      // Track tokens from result metadata if available
      const meta = params.result as { tokens?: number; costUsd?: number } | null;
      if (meta?.tokens) state.totalTokens += meta.tokens;
      if (meta?.costUsd) state.totalCostUsd += meta.costUsd;
    },

    stats() {
      return { ...state };
    },

    reset() {
      state = {
        totalTokens: 0,
        startTime: Date.now(),
        totalCostUsd: 0,
        toolCallCount: 0,
        stepCount: 0,
      };
    },
  };

  return middleware;
}
