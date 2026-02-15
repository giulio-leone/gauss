// =============================================================================
// @giulio-leone/gaussflow-agent — Public API
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export {
  GaussFlowError,
  ToolExecutionError,
  PluginError,
  McpConnectionError,
  RuntimeError,
  StreamingError,
  ConfigurationError,
} from "./errors/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  DeepAgentConfig,
  ContextConfig,
  ApprovalConfig,
  SubagentConfig,
  CheckpointConfig,
  ApprovalRequest,
  AgentEventType,
  AgentEvent,
  AgentEventHandler,
  FilesystemZone,
  FileEntry,
  FileStat,
  ListOptions,
  SearchOptions,
  SearchResult,
  Message,
  CompressedContext,
  SessionState,
} from "./types.js";

export type { RuntimePort } from "./ports/runtime.port.js";

// ─────────────────────────────────────────────────────────────────────────────
// Ports (contracts for hexagonal architecture)
// ─────────────────────────────────────────────────────────────────────────────

export type { MemoryPort } from "./ports/memory.port.js";
export type { LearningPort } from "./ports/learning.port.js";
export type { FilesystemPort } from "./ports/filesystem.port.js";
export type {
  ValidationPort,
  ValidationResult,
} from "./ports/validation.port.js";
export type {
  McpPort,
  McpToolDefinition,
  McpToolResult,
  McpToolResultContent,
  McpServerInfo,
  McpServerConfig,
} from "./ports/mcp.port.js";
export type {
  ModelPort,
  ModelGenerateOptions,
  ModelGenerateResult,
  ModelStreamResult,
} from "./ports/model.port.js";
export type {
  TokenCounterPort,
  TokenBudget,
  TokenUsage,
} from "./ports/token-counter.port.js";
export type { TracingPort, Span } from "./ports/tracing.port.js";
export type { MetricsPort } from "./ports/metrics.port.js";
export type { LoggingPort, LogLevel, LogEntry } from "./ports/logging.port.js";

// ─────────────────────────────────────────────────────────────────────────────
// Domain Schemas
// ─────────────────────────────────────────────────────────────────────────────

export {
  TodoSchema,
  TodoStatusSchema,
  TodoListSchema,
  WriteTodosInputSchema,
  UpdateTodoInputSchema,
  type Todo,
  type TodoStatus,
  type TodoList,
  type WriteTodosInput,
  type UpdateTodoInput,
} from "./domain/todo.schema.js";

export {
  CheckpointSchema,
  type Checkpoint,
} from "./domain/checkpoint.schema.js";

export {
  UserProfileSchema,
  UserMemorySchema,
  SharedKnowledgeSchema,
  type UserProfile,
  type UserMemory,
  type UserMemoryInput,
  type SharedKnowledge,
  type SharedKnowledgeInput,
} from "./domain/learning.schema.js";

export {
  MessageSchema,
  CompressedContextSchema,
  ConversationStateSchema,
  type MessageType,
  type CompressedContextType,
  type ConversationState,
} from "./domain/conversation.schema.js";

export {
  AgentEventTypeSchema,
  AgentEventSchema,
  type AgentEventTypeValue,
  type AgentEventValue,
} from "./domain/events.schema.js";

export {
  EvalMetricsSchema,
  EvalResultSchema,
  type EvalMetrics,
  type EvalResult,
} from "./domain/eval.schema.js";

export type {
  RetryConfig,
  WorkflowStep,
  WorkflowContext,
  WorkflowResult,
} from "./domain/workflow.schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────

export { AbstractBuilder } from "./utils/abstract-builder.js";

// ─────────────────────────────────────────────────────────────────────────────
// Agent Configuration
// ─────────────────────────────────────────────────────────────────────────────

export {
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_APPROVAL_CONFIG,
  DEFAULT_SUBAGENT_CONFIG,
  DEFAULT_CHECKPOINT_CONFIG,
  resolveContextConfig,
  resolveApprovalConfig,
  resolveSubagentConfig,
  resolveCheckpointConfig,
} from "./agent/agent-config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Agent — Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export { DeepAgent, DeepAgentBuilder } from "./agent/deep-agent.js";
export type { DeepAgentResult, DeepAgentRunOptions } from "./agent/deep-agent.js";
export { ToolManager } from "./agent/tool-manager.js";
export { ExecutionEngine } from "./agent/execution-engine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Agent — Approval & Events
// ─────────────────────────────────────────────────────────────────────────────

export { ApprovalManager } from "./agent/approval-manager.js";
export { EventBus } from "./agent/event-bus.js";

// ─────────────────────────────────────────────────────────────────────────────
// Plugins
// ─────────────────────────────────────────────────────────────────────────────

export type {
  DeepAgentPlugin,
  PluginHooks,
  PluginContext,
  PluginSetupContext,
  PluginRunMetadata,
  BeforeRunParams,
  BeforeRunResult,
  AfterRunParams,
  BeforeToolParams,
  BeforeToolResult,
  AfterToolParams,
  BeforeStepParams,
  BeforeStepResult,
  AfterStepParams,
  OnErrorParams,
  OnErrorResult,
} from "./ports/plugin.port.js";
export {
  PluginManager,
  BasePlugin,
  AgentCardPlugin,
  createAgentCardPlugin,
  A2APlugin,
  createA2APlugin,
  createA2AJsonRpcHandler,
  createA2AHttpHandler,
  GuardrailsPlugin,
  createGuardrailsPlugin,
  createPiiFilter,
  GuardrailsError,
  OneCrawlPlugin,
  createOneCrawlPlugin,
  VectorlessPlugin,
  createVectorlessPlugin,
  EvalsPlugin,
  createEvalsPlugin,
  WorkflowPlugin,
  WorkflowError,
  createWorkflowPlugin,
  ObservabilityPlugin,
  createObservabilityPlugin,
} from "./plugins/index.js";
export type {
  AgentCardPluginOptions,
  AgentCardSnapshot,
  AgentCardProvider,
  AgentCardSource,
  A2APluginOptions,
  A2AAgentRuntime,
  A2AJsonRpcRequest,
  A2AJsonRpcResponse,
  A2ATask,
  A2ATaskStatus,
  A2ATasksSendParams,
  A2ARequestHandlers,
  GuardrailsPluginOptions,
  ContentFilter,
  OneCrawlPluginOptions,
  VectorlessPluginOptions,
  EvalsPluginOptions,
  EvalScorer,
  WorkflowPluginConfig,
  ObservabilityPluginConfig,
} from "./plugins/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Filesystem (runtime-agnostic)
// ─────────────────────────────────────────────────────────────────────────────

export { VirtualFilesystem, type DiskSyncFn } from "./adapters/filesystem/virtual-fs.adapter.js";
// Node.js-specific: LocalFilesystem → import from "@giulio-leone/gaussflow-agent/node"

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — MCP
// ─────────────────────────────────────────────────────────────────────────────

export { GaussFlowMcpAdapter } from "./adapters/mcp/gaussflow-mcp.adapter.js";
export { AiSdkMcpAdapter } from "./adapters/mcp/ai-sdk-mcp.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Memory
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryAdapter } from "./adapters/memory/in-memory.adapter.js";
export { SupabaseMemoryAdapter } from "./adapters/memory/supabase.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Learning
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryLearningAdapter } from "./adapters/learning/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Tracing
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryTracingAdapter } from "./adapters/tracing/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Metrics
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryMetricsAdapter } from "./adapters/metrics/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Logging
// ─────────────────────────────────────────────────────────────────────────────

export { ConsoleLoggingAdapter } from "./adapters/logging/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Validation
// ─────────────────────────────────────────────────────────────────────────────

export { ZodValidationAdapter } from "./adapters/validation/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Runtime
// ─────────────────────────────────────────────────────────────────────────────

export { BaseRuntimeAdapter } from "./adapters/runtime/base-runtime.adapter.js";
export { NodeRuntimeAdapter } from "./adapters/runtime/node-runtime.adapter.js";
export { DenoRuntimeAdapter } from "./adapters/runtime/deno-runtime.adapter.js";
export { BunRuntimeAdapter } from "./adapters/runtime/bun-runtime.adapter.js";
export { EdgeRuntimeAdapter } from "./adapters/runtime/edge-runtime.adapter.js";
export { detectRuntimeName, createRuntimeAdapter, createRuntimeAdapterAsync, type RuntimeName } from "./adapters/runtime/detect-runtime.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tools — Filesystem
// ─────────────────────────────────────────────────────────────────────────────

export {
  createFilesystemTools,
  createLsTool,
  createReadFileTool,
  createWriteFileTool,
  createEditFileTool,
  createGlobTool,
  createGrepTool,
} from "./tools/filesystem/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tools — Subagent
// ─────────────────────────────────────────────────────────────────────────────

export {
  createSubagentTools,
  createTaskTool,
} from "./tools/subagent/index.js";

export type { TaskToolConfig } from "./tools/subagent/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tools — Planning
// ─────────────────────────────────────────────────────────────────────────────

export {
  createPlanningTools,
  createWriteTodosTool,
  createReviewTodosTool,
} from "./tools/planning/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Token Counter (runtime-agnostic)
// ─────────────────────────────────────────────────────────────────────────────

export { ApproximateTokenCounter } from "./adapters/token-counter/approximate.adapter.js";
// Node.js-specific: TiktokenTokenCounter → import from "@giulio-leone/gaussflow-agent/node"

// ─────────────────────────────────────────────────────────────────────────────
// Context — Token Tracking, Compression, Summarization
// ─────────────────────────────────────────────────────────────────────────────

export { TokenTracker } from "./context/token-tracker.js";
export { ContextManager } from "./context/context-manager.js";
export { RollingSummarizer } from "./context/rolling-summarizer.js";
export type {
  ContextManagerDeps,
  RollingSummarizerDeps,
  TokenTrackerSnapshot,
} from "./context/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stop Conditions
// ─────────────────────────────────────────────────────────────────────────────

export { createAllTodosDoneCondition } from "./agent/stop-conditions.js";

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Detection
// ─────────────────────────────────────────────────────────────────────────────

export {
  detectRuntime,
  detectCapabilities,
} from "./runtime/detect.js";
export type {
  RuntimeId,
  RuntimeCapabilities,
} from "./runtime/detect.js";

// ---------------------------------------------------------------------------
// Graph — Multi-Agent Collaboration
// ---------------------------------------------------------------------------
export { AgentGraph, AgentGraphBuilder } from "./graph/agent-graph.js";
export { SharedContext } from "./graph/shared-context.js";
export { GraphExecutor } from "./graph/graph-executor.js";
export type { AgentNodeConfig, NodeResult } from "./graph/agent-node.js";
export type { ConsensusPort, ConsensusResult } from "./ports/consensus.port.js";
export { LlmJudgeConsensus } from "./adapters/consensus/llm-judge.adapter.js";
export { MajorityVoteConsensus } from "./adapters/consensus/majority-vote.adapter.js";
export { DebateConsensus } from "./adapters/consensus/debate.adapter.js";
export type { GraphConfig, GraphResult, GraphStreamEvent } from "./domain/graph.schema.js";

// ---------------------------------------------------------------------------
// Streaming — Real-Time Event Streaming
// ---------------------------------------------------------------------------
export { createEventStream } from "./streaming/event-stream.js";
export { createSseHandler } from "./streaming/sse-handler.js";
export { handleWebSocket } from "./streaming/ws-handler.js";
export { createDeltaEncoder } from "./streaming/delta-encoder.js";
export { createGraphEventStream } from "./streaming/graph-stream.js";
export type { EventStreamOptions } from "./streaming/event-stream.js";
export type { SseHandlerOptions } from "./streaming/sse-handler.js";
export type { WsCommand, WsHandlerOptions, WebSocketLike } from "./streaming/ws-handler.js";
export type { DeltaEncoder } from "./streaming/delta-encoder.js";

// ---------------------------------------------------------------------------
// REST API — HTTP Server
// ---------------------------------------------------------------------------
export { GaussFlowServer } from "./rest/server.js";
export { Router } from "./rest/router.js";
export type {
  ServerOptions as RestServerOptions,
  RunRequest,
  RunResponse,
  StreamEvent,
  GraphRunRequest,
  ErrorResponse,
  HealthResponse,
  InfoResponse,
} from "./rest/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Deprecated Aliases (Backward Compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use GaussFlowServer */
export { GaussFlowServer as OneAgentServer } from "./rest/server.js";
/** @deprecated Use GaussFlowMcpAdapter */
export { GaussFlowMcpAdapter as OnegenUiMcpAdapter } from "./adapters/mcp/gaussflow-mcp.adapter.js";
