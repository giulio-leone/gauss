// =============================================================================
// Gauss LLM Core — Type Definitions
// Zero external dependencies. Compatible with gauss-core Rust NAPI.
// =============================================================================

import type { ZodType } from "zod";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallType: "function";
  toolCallId: string;
  toolName: string;
  args: string;
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export type ContentPart = TextPart | ToolCallPart | ToolResultPart;

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: string | ContentPart[];
}

export interface AssistantMessage {
  role: "assistant";
  content: string | ContentPart[];
}

export interface ToolMessage {
  role: "tool";
  content: ToolResultPart[];
}

export type CoreMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ---------------------------------------------------------------------------
// Token usage
// ---------------------------------------------------------------------------

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
}

// ---------------------------------------------------------------------------
// Tool Call
// ---------------------------------------------------------------------------

export interface ToolCall {
  toolCallType: "function";
  toolCallId: string;
  toolName: string;
  args: string;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// LanguageModel — Provider interface (V3 spec compatible)
// ---------------------------------------------------------------------------

export interface LanguageModelGenerateOptions {
  inputFormat: "prompt" | "messages";
  mode:
    | { type: "regular"; tools?: LanguageModelTool[]; toolChoice?: ToolChoice }
    | { type: "object-json"; schema?: unknown }
    | { type: "object-tool"; tool: LanguageModelTool };
  prompt: CoreMessage[];
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  providerMetadata?: Record<string, unknown>;
}

export interface LanguageModelTool {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export type ToolChoice =
  | { type: "auto" }
  | { type: "none" }
  | { type: "required" }
  | { type: "tool"; toolName: string };

export interface LanguageModelGenerateResult {
  text?: string;
  toolCalls?: ToolCall[];
  finishReason: FinishReason;
  usage: TokenUsage;
  rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  rawResponse?: { headers?: Record<string, string> };
  warnings?: unknown[];
  request?: { body: string };
  response?: {
    id: string;
    timestamp: Date;
    modelId: string;
  };
  providerMetadata?: Record<string, unknown>;
  sources?: unknown[];
  reasoning?: unknown;
}

export type FinishReason = "stop" | "tool-calls" | "length" | "content-filter" | "error" | "other";

// Stream types
export interface TextDeltaPart {
  type: "text-delta";
  textDelta: string;
}

export interface ToolCallStreamPart {
  type: "tool-call";
  toolCallType: "function";
  toolCallId: string;
  toolName: string;
  args: string;
}

export interface ToolCallDeltaPart {
  type: "tool-call-delta";
  toolCallType: "function";
  toolCallId: string;
  toolName: string;
  argsTextDelta: string;
}

export interface FinishPart {
  type: "finish";
  finishReason: FinishReason;
  usage: TokenUsage;
}

export type StreamPart = TextDeltaPart | ToolCallStreamPart | ToolCallDeltaPart | FinishPart;

export interface LanguageModelStreamResult {
  stream: ReadableStream<StreamPart>;
  rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  rawResponse?: { headers?: Record<string, string> };
  warnings?: unknown[];
  request?: { body: string };
}

/**
 * Language model interface — the core provider abstraction.
 * Implementations: MockProvider (testing), GaussProvider (Rust NAPI), or any custom provider.
 */
export interface LanguageModel {
  readonly specificationVersion: string;
  readonly provider: string;
  readonly modelId: string;
  readonly defaultObjectGenerationMode?: string;

  doGenerate(options: LanguageModelGenerateOptions): Promise<LanguageModelGenerateResult>;
  doStream(options: LanguageModelGenerateOptions): Promise<LanguageModelStreamResult>;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export interface ToolDefinition<PARAMS = unknown, RESULT = unknown> {
  type: "function";
  description?: string;
  parameters: ZodType<PARAMS>;
  execute?: (args: PARAMS, options?: ToolExecuteOptions) => Promise<RESULT>;
}

export interface ToolExecuteOptions {
  abortSignal?: AbortSignal;
  toolCallId?: string;
}

export type Tool<PARAMS = unknown, RESULT = unknown> = ToolDefinition<PARAMS, RESULT>;

export type ToolSet = Record<string, Tool>;

// ---------------------------------------------------------------------------
// Step result (for multi-step agent loops)
// ---------------------------------------------------------------------------

export interface StepResult<TOOLS extends ToolSet = ToolSet> {
  text: string;
  toolCalls: Array<{
    toolCallType: "function";
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  toolResults: ToolResult[];
  finishReason: FinishReason;
  usage: TokenUsage;
  warnings?: unknown[];
  response?: {
    id: string;
    timestamp: Date;
    modelId: string;
  };
}

// ---------------------------------------------------------------------------
// Generate / Stream result
// ---------------------------------------------------------------------------

export interface GenerateTextResult<TOOLS extends ToolSet = ToolSet, OUTPUT = never> {
  text: string;
  toolCalls: Array<{
    toolCallType: "function";
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  toolResults: ToolResult[];
  finishReason: FinishReason;
  usage: TokenUsage;
  steps: StepResult<TOOLS>[];
  warnings?: unknown[];
  response?: {
    id: string;
    timestamp: Date;
    modelId: string;
  };
}

export interface StreamTextResult<TOOLS extends ToolSet = ToolSet, OUTPUT = never> {
  textStream: ReadableStream<string>;
  fullStream: ReadableStream<StreamPart>;
  text: Promise<string>;
  toolCalls: Promise<Array<{ toolCallType: "function"; toolCallId: string; toolName: string; args: unknown }>>;
  toolResults: Promise<ToolResult[]>;
  finishReason: Promise<FinishReason>;
  usage: Promise<TokenUsage>;
  steps: Promise<StepResult<TOOLS>[]>;
}
