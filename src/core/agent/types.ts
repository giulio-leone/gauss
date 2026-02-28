// =============================================================================
// Gauss Agent Core — Type Definitions
// The foundational primitive of gauss-flow.
// =============================================================================

import type { ZodType } from "zod";
import type {
  LanguageModel,
  ToolSet,
  TokenUsage,
  FinishReason,
  StepResult,
  ToolResult,
  CoreMessage,
} from "../llm/types.js";

// ---------------------------------------------------------------------------
// Output specification
// ---------------------------------------------------------------------------

export interface OutputSpec<T = unknown> {
  type: "object";
  schema: ZodType<T>;
  description?: string;
}

// ---------------------------------------------------------------------------
// Stop conditions
// ---------------------------------------------------------------------------

export type StopCondition = (event: StopConditionEvent) => boolean;

export interface StopConditionEvent {
  steps: StepResult[];
  stepCount: number;
  lastStep: StepResult | undefined;
}

// ---------------------------------------------------------------------------
// Decorator — composable lifecycle hooks
// ---------------------------------------------------------------------------

export interface Decorator {
  readonly name: string;

  /** Setup (called once, lazily before first run) */
  initialize?(): Promise<void>;
  /** Teardown */
  destroy?(): Promise<void>;

  /** Before agent run — can modify context or abort */
  beforeRun?(ctx: RunContext): Promise<void | RunContext>;
  /** After agent run — can transform result */
  afterRun?(ctx: RunContext, result: AgentResult): Promise<AgentResult>;

  /** Before each step in the tool loop */
  beforeStep?(ctx: StepContext): Promise<void>;
  /** After each step */
  afterStep?(ctx: StepContext, step: StepResult): Promise<StepResult>;

  /** Before a tool is called */
  beforeToolCall?(ctx: ToolCallContext): Promise<void | ToolCallContext>;
  /** After a tool returns */
  afterToolCall?(ctx: ToolCallContext, result: unknown): Promise<unknown>;

  /** Error handler */
  onError?(error: Error, ctx: RunContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// Context objects passed to decorators
// ---------------------------------------------------------------------------

export interface RunContext {
  /** Agent config snapshot */
  readonly config: Readonly<AgentConfig>;
  /** The user prompt for this run */
  prompt: string;
  /** Per-run options */
  options: RunOptions;
  /** Conversation messages (built during run) */
  messages: CoreMessage[];
  /** Shared metadata bag for decorators to communicate */
  metadata: Record<string, unknown>;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

export interface StepContext extends RunContext {
  /** Current step index (0-based) */
  stepIndex: number;
  /** All steps so far */
  steps: StepResult[];
}

export interface ToolCallContext extends StepContext {
  /** Tool name being called */
  toolName: string;
  /** Arguments passed to the tool */
  toolArgs: unknown;
  /** Tool call ID */
  toolCallId: string;
}

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
  /** The language model to use (required) */
  model: LanguageModel;

  /** System instructions for the agent */
  instructions?: string;

  /** Tools available to the agent */
  tools?: ToolSet;

  /** Sub-agents exposed as automatic tools */
  agents?: Record<string, AgentInstance>;

  /** Maximum steps in the tool loop (default: 10) */
  maxSteps?: number;

  /** Structured output specification */
  output?: OutputSpec;

  /** Stop conditions (evaluated after each step) */
  stopWhen?: StopCondition | StopCondition[];

  /** Agent name (for identification in multi-agent setups) */
  name?: string;

  /** Agent description (used as tool description when agent is a sub-agent) */
  description?: string;
}

// ---------------------------------------------------------------------------
// Run options (per-invocation overrides)
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** Override structured output for this run */
  output?: OutputSpec;
  /** Override max steps for this run */
  maxSteps?: number;
  /** Additional messages to prepend */
  messages?: CoreMessage[];
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Per-run metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent result
// ---------------------------------------------------------------------------

export interface AgentResult<TOutput = string> {
  /** Final generated text */
  text: string;
  /** Typed output (when output spec is provided) */
  output: TOutput;

  /** All steps taken during the agent loop */
  steps: StepResult[];
  /** All tool calls made */
  toolCalls: Array<{
    toolCallType: "function";
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  /** All tool results */
  toolResults: ToolResult[];

  /** Token usage */
  usage: TokenUsage;
  /** Why generation stopped */
  finishReason: FinishReason;

  /** Total wall-clock duration in ms */
  duration: number;
  /** Cost info (if cost decorator active) */
  cost?: CostInfo;
  /** Conversation messages */
  messages: CoreMessage[];
}

// ---------------------------------------------------------------------------
// Stream types
// ---------------------------------------------------------------------------

export interface StreamChunk {
  /** Text delta */
  text: string;
}

export interface AgentStream extends AsyncIterable<StreamChunk> {
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk>;

  /** Resolves to full text on completion */
  readonly text: Promise<string>;
  /** Resolves to full result on completion */
  readonly result: Promise<AgentResult>;
  /** Resolves to token usage on completion */
  readonly usage: Promise<TokenUsage>;

  /** Abort the generation */
  abort(): void;
}

// ---------------------------------------------------------------------------
// Agent instance — the returned object from Agent()
// ---------------------------------------------------------------------------

export interface AgentInstance {
  /** Run the agent with a prompt */
  run(prompt: string, options?: RunOptions): Promise<AgentResult>;
  /** Stream the agent response */
  stream(prompt: string, options?: RunOptions): AgentStream;

  /** Add a decorator, returning a NEW agent instance (immutable) */
  with(decorator: Decorator): AgentInstance;
  /** Clone with config overrides */
  clone(overrides?: Partial<AgentConfig>): AgentInstance;

  /** Readonly config snapshot */
  readonly config: Readonly<AgentConfig>;
  /** Readonly list of applied decorators */
  readonly decorators: ReadonlyArray<Decorator>;
}

// ---------------------------------------------------------------------------
// Cost info
// ---------------------------------------------------------------------------

export interface CostInfo {
  totalUsd: number;
  inputTokensCost: number;
  outputTokensCost: number;
}

// ---------------------------------------------------------------------------
// Agent factory signature
// ---------------------------------------------------------------------------

export type AgentFactory = (config: AgentConfig) => AgentInstance;
