// =============================================================================
// Gauss LLM Core — Barrel Export
// Zero external dependencies. All LLM functionality in one module.
// =============================================================================

// Types
export type {
  LanguageModel,
  LanguageModelGenerateOptions,
  LanguageModelGenerateResult,
  LanguageModelStreamResult,
  LanguageModelTool,
  Tool,
  ToolSet,
  ToolDefinition,
  ToolExecuteOptions,
  ToolCall,
  ToolResult,
  ToolChoice,
  CoreMessage,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ContentPart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  TokenUsage,
  FinishReason,
  StepResult,
  GenerateTextResult,
  StreamTextResult,
  StreamPart,
  TextDeltaPart,
  ToolCallStreamPart,
  ToolCallDeltaPart,
  FinishPart,
} from "./types.js";

// Functions
export { tool } from "./tool.js";
export type { ToolConfig } from "./tool.js";
export { generateText } from "./generate-text.js";
export type { GenerateTextOptions } from "./generate-text.js";
export { streamText } from "./stream-text.js";
export type { StreamTextOptions } from "./stream-text.js";
export { stepCountIs, hasToolCall } from "./stop-conditions.js";
export type { StopCondition } from "./stop-conditions.js";
export { Output } from "./output.js";
export type { OutputSpec } from "./output.js";
export { isNativeModel, GAUSS_NATIVE_MARKER } from "./native-bridge.js";
