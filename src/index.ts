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
  AgentMemoryPort,
  MemoryEntry,
  MemoryStats,
  RecallOptions,
} from "./ports/agent-memory.port.js";
export type {
  PluginManifest,
  PluginRegistryPort,
  PluginSource,
} from "./ports/plugin-registry.port.js";
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
  McpServerPort,
  McpServerOptions,
  McpToolServerDefinition,
} from "./ports/mcp-server.port.js";
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
export type { TelemetryPort, TelemetrySpan } from "./ports/telemetry.port.js";
export type { LoggingPort, LogLevel, LogEntry } from "./ports/logging.port.js";
export type {
  ISemanticScrapingPort,
  ManifestTool,
  PageToolSet,
  SiteToolManifest,
  SemanticTool,
} from "./ports/semantic-scraping.port.js";
export type {
  ChunkingPort,
  ChunkOptions,
  Chunk,
} from "./ports/chunking.port.js";
export type {
  PartialJsonPort,
  JsonAccumulator,
} from "./ports/partial-json.port.js";
export type {
  ReRankingPort,
  ReRankingOptions,
  ScoredResult,
  SourceAttribution,
} from "./ports/reranking.port.js";
export type {
  ToolCompositionPort,
  ToolPipeline,
  ToolMiddleware,
} from "./ports/tool-composition.port.js";
export type {
  CostTrackerPort,
  CostTokenUsage,
  CostEstimate,
} from "./ports/cost-tracker.port.js";

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
  StepType,
  ParallelStep,
  ConditionalStep,
  LoopStep,
  AgentStep,
  AnyStep,
  WorkflowDefinition,
  ValidationResult as WorkflowValidationResult,
  WorkflowEventType,
  WorkflowEvent,
} from "./domain/workflow.schema.js";

export type {
  WorkflowPort,
  WorkflowEventListener,
} from "./ports/workflow.port.js";

export {
  WorkflowBuilder,
  defineWorkflow,
} from "./domain/workflow.builder.js";

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

export { DeepAgent } from "./agent/deep-agent.js";
export { DeepAgentBuilder } from "./agent/deep-agent-builder.js";
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
  createA2ASseHandler,
  A2ADelegationManager,
  A2APushNotifier,
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
  SemanticScrapingPlugin,
  createSemanticScrapingPlugin,
  McpServerPlugin,
  createMcpServerPlugin,
} from "./plugins/index.js";
export {
  MemoryPlugin,
  createMemoryPlugin,
} from "./plugins/memory.plugin.js";
export type { MemoryPluginOptions } from "./plugins/memory.plugin.js";
export {
  PluginRegistryPlugin,
  createPluginRegistryPlugin,
} from "./plugins/plugin-registry.plugin.js";
export type { PluginRegistryPluginOptions } from "./plugins/plugin-registry.plugin.js";
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
  A2ATaskEvent,
  TaskEventListener,
  AgentCapability,
  DelegationResult,
  PushNotificationConfig,
  GuardrailsPluginOptions,
  ContentFilter,
  OneCrawlPluginOptions,
  VectorlessPluginOptions,
  EvalsPluginOptions,
  EvalScorer,
  WorkflowPluginConfig,
  WorkflowPluginInput,
  ObservabilityConfig,
  ObservabilityPluginConfig,
  AgentMetrics,
  SemanticScrapingPluginOptions,
  McpServerPluginOptions,
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
// Adapters — MCP Server
// ─────────────────────────────────────────────────────────────────────────────

export { DefaultMcpServerAdapter } from "./adapters/mcp-server/index.js";
export type { McpToolExecutor } from "./adapters/mcp-server/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Memory
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryAdapter } from "./adapters/memory/in-memory.adapter.js";
export { InMemoryAgentMemoryAdapter } from "./adapters/memory/in-memory-agent-memory.adapter.js";
export { SupabaseMemoryAdapter } from "./adapters/memory/supabase.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Plugin Registry
// ─────────────────────────────────────────────────────────────────────────────

export { DefaultPluginRegistryAdapter } from "./adapters/plugin-registry/default-plugin-registry.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Learning
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryLearningAdapter } from "./adapters/learning/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Workflow
// ─────────────────────────────────────────────────────────────────────────────

export { DefaultWorkflowEngine } from "./adapters/workflow/index.js";
export type { DefaultWorkflowEngineOptions, AgentExecutor } from "./adapters/workflow/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Tracing
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryTracingAdapter } from "./adapters/tracing/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Metrics
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryMetricsAdapter } from "./adapters/metrics/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Telemetry (OpenTelemetry-compatible)
// ─────────────────────────────────────────────────────────────────────────────

export { ConsoleTelemetryAdapter } from "./adapters/telemetry/console-telemetry.adapter.js";
export { OtelTelemetryAdapter } from "./adapters/telemetry/otel-telemetry.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Logging
// ─────────────────────────────────────────────────────────────────────────────

export { ConsoleLoggingAdapter } from "./adapters/logging/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Semantic Scraping
// ─────────────────────────────────────────────────────────────────────────────

export { SemanticScrapingAdapter, urlToPattern, hashTools } from "./adapters/semantic-scraping/index.js";

export { DefaultChunkingAdapter } from "./adapters/chunking/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Re-Ranking
// ─────────────────────────────────────────────────────────────────────────────

export { DefaultReRankingAdapter } from "./adapters/reranking/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Validation
// ─────────────────────────────────────────────────────────────────────────────

export { ZodValidationAdapter } from "./adapters/validation/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Tool Composition
// ─────────────────────────────────────────────────────────────────────────────

export { DefaultToolCompositionAdapter } from "./adapters/tool-composition/default-tool-composition.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Cost Tracker
// ─────────────────────────────────────────────────────────────────────────────

export { DefaultCostTrackerAdapter } from "./adapters/cost-tracker/index.js";
export type { CostTrackerOptions } from "./adapters/cost-tracker/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Partial JSON
// ─────────────────────────────────────────────────────────────────────────────

export { createDefaultPartialJsonAdapter, DefaultPartialJsonAdapter } from "./adapters/partial-json/index.js";

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
export type { GraphVisualizationPort, GraphDescriptor } from "./ports/graph-visualization.port.js";
export { AsciiGraphAdapter } from "./adapters/graph-visualization/ascii-graph.adapter.js";
export { MermaidGraphAdapter } from "./adapters/graph-visualization/mermaid-graph.adapter.js";

// ---------------------------------------------------------------------------
// Templates — Prompt Template System
// ---------------------------------------------------------------------------
export { PromptTemplate } from "./templates/index.js";
export type { PromptTemplateConfig } from "./templates/index.js";

// ---------------------------------------------------------------------------
// Lifecycle — Startup, Shutdown, Health Management
// ---------------------------------------------------------------------------
export { LifecycleManager } from "./agent/lifecycle.js";
export type { LifecycleHooks, HealthStatus } from "./agent/lifecycle.js";

// ---------------------------------------------------------------------------
// Hot-Reload — Watch config files and reload agents
// ---------------------------------------------------------------------------
export type { HotReloadPort, AgentConfig } from "./ports/hot-reload.port.js";
export { FileWatcherAdapter } from "./adapters/hot-reload/index.js";
export { AgentConfigLoader } from "./agent/agent-config-loader.js";
export type { ModelResolver } from "./agent/agent-config-loader.js";

// ---------------------------------------------------------------------------
// Streaming — Real-Time Event Streaming
// ---------------------------------------------------------------------------
export { createEventStream } from "./streaming/event-stream.js";
export { createSseHandler } from "./streaming/sse-handler.js";
export { handleWebSocket } from "./streaming/ws-handler.js";
export { createDeltaEncoder } from "./streaming/delta-encoder.js";
export { createGraphEventStream } from "./streaming/graph-stream.js";
export { streamJson } from "./streaming/stream-json.js";
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

// ---------------------------------------------------------------------------
// Testing — Agent Test Harness
// ---------------------------------------------------------------------------
export { createMockProvider } from "./testing/mock-provider.js";
export type { MockResponse } from "./testing/mock-provider.js";
export { runAgentTest } from "./testing/agent-test-runner.js";
export type { AgentTestResult } from "./testing/agent-test-runner.js";
export {
  assertToolCalled,
  assertToolNotCalled,
  assertResponseContains,
  assertResponseMatches,
  assertMaxSteps,
  assertMaxTokens,
} from "./testing/assertions.js";
export { createSnapshot, compareSnapshots } from "./testing/snapshot.js";

// ─────────────────────────────────────────────────────────────────────────────
// Deprecated Aliases (Backward Compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use GaussFlowServer */
export { GaussFlowServer as OneAgentServer } from "./rest/server.js";
/** @deprecated Use GaussFlowMcpAdapter */
export { GaussFlowMcpAdapter as OnegenUiMcpAdapter } from "./adapters/mcp/gaussflow-mcp.adapter.js";
