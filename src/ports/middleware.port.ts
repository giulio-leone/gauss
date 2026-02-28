// =============================================================================
// Middleware Port — Composable, typed, ordered middleware system
// =============================================================================

import type { Tool } from "../core/llm/index.js";

// =============================================================================
// Priority — Determines middleware execution order
// =============================================================================

export enum MiddlewarePriority {
  /** Executes first — security, auth, rate limiting */
  FIRST = 0,
  /** Executes early — validation, input transformation */
  EARLY = 250,
  /** Default priority */
  NORMAL = 500,
  /** Executes late — logging, metrics */
  LATE = 750,
  /** Executes last — cleanup, final telemetry */
  LAST = 1000,
}

// =============================================================================
// Context — Typed state container passed through middleware chain
// =============================================================================

export interface MiddlewareContext {
  readonly sessionId: string;
  readonly agentName?: string;
  readonly timestamp: number;
  /** Mutable metadata bag — each middleware can read/write entries */
  readonly metadata: Record<string, unknown>;
}

// =============================================================================
// Hook parameter & result types
// =============================================================================

export interface BeforeAgentParams {
  prompt: string;
  instructions: string;
  tools: Record<string, Tool>;
}

export interface BeforeAgentResult {
  /** Modified prompt (optional — original used if omitted) */
  prompt?: string;
  /** Modified instructions (optional) */
  instructions?: string;
  /** Additional tools to inject (merged with existing) */
  tools?: Record<string, Tool>;
  /** If true, skip agent execution entirely and use `earlyResult` */
  abort?: boolean;
  /** Result to return when `abort` is true */
  earlyResult?: string;
}

export interface AfterAgentParams {
  prompt: string;
  result: {
    text: string;
    steps: unknown[];
    sessionId: string;
  };
}

export interface AfterAgentResult {
  /** Modified result text (optional) */
  text?: string;
}

export interface BeforeToolCallParams {
  toolName: string;
  args: unknown;
  stepIndex: number;
}

export interface BeforeToolCallResult {
  /** Modified args (optional) */
  args?: unknown;
  /** If true, skip this tool call and use `mockResult` */
  skip?: boolean;
  /** Result to return when `skip` is true */
  mockResult?: unknown;
}

export interface AfterToolCallParams {
  toolName: string;
  args: unknown;
  result: unknown;
  stepIndex: number;
  durationMs: number;
}

export interface AfterToolCallResult {
  /** Modified result (optional) */
  result?: unknown;
}

export interface OnMiddlewareErrorParams {
  error: unknown;
  phase: "beforeAgent" | "afterAgent" | "beforeTool" | "afterTool";
  middlewareName: string;
}

export interface OnMiddlewareErrorResult {
  /** If true, suppress the error and continue the chain */
  suppress?: boolean;
  /** Fallback result to use when suppressing */
  fallbackResult?: unknown;
}

// =============================================================================
// Middleware Port — Individual middleware unit
// =============================================================================

export interface MiddlewarePort {
  /** Unique name for this middleware */
  readonly name: string;

  /** Execution priority — lower values execute first */
  readonly priority: MiddlewarePriority;

  /** Called before agent execution starts */
  beforeAgent?(
    ctx: MiddlewareContext,
    params: BeforeAgentParams,
  ): Promise<BeforeAgentResult | void> | BeforeAgentResult | void;

  /** Called after agent execution completes */
  afterAgent?(
    ctx: MiddlewareContext,
    params: AfterAgentParams,
  ): Promise<AfterAgentResult | void> | AfterAgentResult | void;

  /** Called before each tool invocation */
  beforeTool?(
    ctx: MiddlewareContext,
    params: BeforeToolCallParams,
  ): Promise<BeforeToolCallResult | void> | BeforeToolCallResult | void;

  /** Called after each tool invocation */
  afterTool?(
    ctx: MiddlewareContext,
    params: AfterToolCallParams,
  ): Promise<AfterToolCallResult | void> | AfterToolCallResult | void;

  /** Called when an error occurs in this or another middleware */
  onError?(
    ctx: MiddlewareContext,
    params: OnMiddlewareErrorParams,
  ): Promise<OnMiddlewareErrorResult | void> | OnMiddlewareErrorResult | void;

  /** Called once during agent initialization */
  setup?(ctx: MiddlewareContext): Promise<void> | void;

  /** Called once during agent shutdown */
  teardown?(ctx: MiddlewareContext): Promise<void> | void;
}

// =============================================================================
// Chain Port — Ordered execution of middleware
// =============================================================================

export interface BeforeAgentChainResult extends BeforeAgentParams {
  /** If true, agent execution should be skipped and `earlyResult` returned */
  aborted?: boolean;
  /** Text to return when aborted */
  earlyResult?: string;
}

export interface MiddlewareChainPort {
  /** Add a middleware to the chain */
  use(middleware: MiddlewarePort): void;

  /** Remove a middleware by name */
  remove(name: string): boolean;

  /** Get all registered middleware (sorted by priority) */
  list(): readonly MiddlewarePort[];

  /** Execute beforeAgent hooks in priority order */
  runBeforeAgent(
    ctx: MiddlewareContext,
    params: BeforeAgentParams,
  ): Promise<BeforeAgentChainResult>;

  /** Execute afterAgent hooks in reverse priority order */
  runAfterAgent(
    ctx: MiddlewareContext,
    params: AfterAgentParams,
  ): Promise<AfterAgentParams>;

  /** Execute beforeTool hooks in priority order */
  runBeforeTool(
    ctx: MiddlewareContext,
    params: BeforeToolCallParams,
  ): Promise<BeforeToolCallResult>;

  /** Execute afterTool hooks in reverse priority order */
  runAfterTool(
    ctx: MiddlewareContext,
    params: AfterToolCallParams,
  ): Promise<AfterToolCallParams>;

  /** Initialize all middleware */
  setup(ctx: MiddlewareContext): Promise<void>;

  /** Teardown all middleware */
  teardown(ctx: MiddlewareContext): Promise<void>;
}
