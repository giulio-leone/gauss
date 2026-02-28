// =============================================================================
// DebugMiddleware — Auto-records checkpoints during agent execution
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
  OnMiddlewareErrorParams,
  OnMiddlewareErrorResult,
} from "../../ports/middleware.port.js";
import { MiddlewarePriority } from "../../ports/middleware.port.js";
import type { DebugState } from "../../ports/agent-debugger.port.js";
import type { DebugSessionImpl } from "./debug-session.js";
import type { InMemoryAgentDebuggerAdapter } from "./debugger.adapter.js";

export class DebugMiddleware implements MiddlewarePort {
  readonly name = "agent-debugger";
  readonly priority = MiddlewarePriority.FIRST;

  private readonly debugger: InMemoryAgentDebuggerAdapter;
  private sessionMap = new Map<string, string>(); // middlewareSessionId → debugSessionId
  private stateMap = new Map<string, DebugState>();
  private startTimeMap = new Map<string, number>();

  constructor(debuggerAdapter: InMemoryAgentDebuggerAdapter) {
    this.debugger = debuggerAdapter;
  }

  /** Bind a middleware context session to a debug session */
  bindSession(middlewareSessionId: string, debugSessionId: string): void {
    this.sessionMap.set(middlewareSessionId, debugSessionId);
  }

  private getSession(ctx: MiddlewareContext): DebugSessionImpl | undefined {
    const debugId = this.sessionMap.get(ctx.sessionId);
    if (!debugId) return undefined;
    return this.debugger.getSessionImpl(debugId);
  }

  private getState(ctx: MiddlewareContext): DebugState {
    let state = this.stateMap.get(ctx.sessionId);
    if (!state) {
      state = {
        messages: [],
        toolCalls: [],
        tokenCount: 0,
        costEstimate: 0,
        elapsedMs: 0,
        metadata: {},
      };
      this.stateMap.set(ctx.sessionId, state);
      this.startTimeMap.set(ctx.sessionId, Date.now());
    }
    state.elapsedMs = Date.now() - (this.startTimeMap.get(ctx.sessionId) ?? Date.now());
    return state;
  }

  private snapshot(state: DebugState): DebugState {
    return {
      messages: [...state.messages],
      toolCalls: [...state.toolCalls],
      tokenCount: state.tokenCount,
      costEstimate: state.costEstimate,
      elapsedMs: state.elapsedMs,
      metadata: { ...state.metadata },
    };
  }

  async beforeAgent(
    ctx: MiddlewareContext,
    params: BeforeAgentParams,
  ): Promise<BeforeAgentResult | void> {
    const session = this.getSession(ctx);
    if (!session) return;
    const state = this.getState(ctx);
    session.addCheckpoint(
      "agent_start",
      { prompt: params.prompt, instructions: params.instructions },
      this.snapshot(state),
    );
  }

  async afterAgent(
    ctx: MiddlewareContext,
    params: AfterAgentParams,
  ): Promise<AfterAgentResult | void> {
    const session = this.getSession(ctx);
    if (!session) return;
    const state = this.getState(ctx);
    state.messages.push({ role: "assistant", content: params.result.text });
    session.addCheckpoint(
      "agent_end",
      { result: params.result.text },
      this.snapshot(state),
    );
  }

  async beforeTool(
    ctx: MiddlewareContext,
    params: BeforeToolCallParams,
  ): Promise<BeforeToolCallResult | void> {
    const session = this.getSession(ctx);
    if (!session) return;
    const state = this.getState(ctx);
    session.addCheckpoint(
      "tool_call",
      { toolName: params.toolName, args: params.args, stepIndex: params.stepIndex },
      this.snapshot(state),
    );
  }

  async afterTool(
    ctx: MiddlewareContext,
    params: AfterToolCallParams,
  ): Promise<AfterToolCallResult | void> {
    const session = this.getSession(ctx);
    if (!session) return;
    const state = this.getState(ctx);
    state.toolCalls.push({
      name: params.toolName,
      args: params.args,
      result: params.result,
    });
    session.addCheckpoint(
      "tool_result",
      {
        toolName: params.toolName,
        args: params.args,
        result: params.result,
        durationMs: params.durationMs,
      },
      this.snapshot(state),
    );
  }

  async onError(
    ctx: MiddlewareContext,
    params: OnMiddlewareErrorParams,
  ): Promise<OnMiddlewareErrorResult | void> {
    const session = this.getSession(ctx);
    if (!session) return;
    const state = this.getState(ctx);
    session.addCheckpoint(
      "error",
      {
        error: params.error instanceof Error ? params.error.message : String(params.error),
        phase: params.phase,
        middlewareName: params.middlewareName,
      },
      this.snapshot(state),
    );
  }

  /** Manually update token/cost state (called externally when LLM usage is known) */
  recordUsage(
    middlewareSessionId: string,
    tokens: number,
    cost: number,
  ): void {
    let state = this.stateMap.get(middlewareSessionId);
    if (!state) {
      state = {
        messages: [],
        toolCalls: [],
        tokenCount: 0,
        costEstimate: 0,
        elapsedMs: 0,
        metadata: {},
      };
      this.stateMap.set(middlewareSessionId, state);
      this.startTimeMap.set(middlewareSessionId, Date.now());
    }
    state.tokenCount += tokens;
    state.costEstimate += cost;
  }
}
