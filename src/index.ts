// =============================================================================
// @giulio-leone/gaussflow-agent — Public API
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// AI SDK re-exports (structured output passthrough)
// ─────────────────────────────────────────────────────────────────────────────

export { Output } from "ai";

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
  DelegationHooks,
  DelegationStartContext,
  DelegationStartResult,
  DelegationIterationContext,
  DelegationIterationResult,
  DelegationCompleteContext,
  DelegationCompletionCheckContext,
  DelegationCompletionCheckResult,
  DelegationMessageFilterContext,
  DelegationMessageFilterResult,
  SubagentConfig,
  McpToolsetSelection,
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
  MemoryTier,
  MemoryStats,
  RecallOptions,
} from "./ports/agent-memory.port.js";
export type {
  PluginManifest,
  PluginRegistryPort,
  PluginSource,
} from "./ports/plugin-registry.port.js";
export type {
  MarketplacePluginManifest,
  MarketplacePort,
} from "./ports/plugin-manifest.port.js";
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
  PolicyEffect,
  PolicyContext,
  PolicyRequest,
  PolicyRule,
  PolicyDecision,
  PolicyAuditRecord,
  PolicyEnginePort,
} from "./ports/policy.port.js";
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
  // Enums & Primitivi
  StepExecutionModeSchema,
  StepStatusSchema as PlanStepStatusSchema,
  StepPrioritySchema,
  PlanStatusSchema,
  PlanEventTypeSchema,
  // Schemas
  ResourceRequirementsSchema,
  IOFieldSchema,
  StepContractSchema,
  StepResultSchema,
  StepConditionSchema,
  LoopConfigSchema,
  SubStepSchema,
  StepSchema as PlanStepSchema,
  PhaseSchema,
  PlanMetadataSchema,
  PlanSchema,
  PlanEventSchema,
  PlanProgressSchema,
  PhaseProgressSchema,
  StepProgressSchema,
  // State machine
  STEP_STATUS_TRANSITIONS,
  PLAN_STATUS_TRANSITIONS,
  isValidStepTransition,
  isValidPlanTransition,
  transitionStep,
  // Factory functions
  createStep,
  createPhase,
  createSubStep,
  createPlan,
  generateStepId,
  // Validation & progress
  validatePlan,
  calculateProgress,
  // Migration
  todosToplan as todosToPlan,
  // Example
  createExamplePlan,
  // Types
  type StepExecutionMode,
  type StepStatus as PlanStepStatus,
  type StepPriority,
  type PlanStatus,
  type ResourceRequirements,
  type IOField,
  type StepContract,
  type StepResult,
  type StepCondition,
  type LoopConfig,
  type SubStep,
  type Step as PlanStep,
  type Phase,
  type PlanMetadata,
  type Plan,
  type PlanEvent,
  type PlanEventType,
  type PlanProgress,
  type PhaseProgress,
  type StepProgress,
  type PlanValidationResult,
} from "./domain/plan.schema.js";

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
  InputMapping,
  OutputMapping,
  WorkflowResult,
  StepType,
  ParallelStep,
  ConditionalStep,
  LoopStep,
  ForeachStep,
  MapStep,
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
  SemanticWebSearchPlugin,
  createSemanticWebSearchPlugin,
  type SemanticWebSearchPluginOptions,
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
// Adapters — Policy
// ─────────────────────────────────────────────────────────────────────────────

export { McpPolicyEngine } from "./adapters/policy/mcp-policy-engine.js";

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
export { TieredAgentMemoryAdapter } from "./adapters/memory/tiered-agent-memory.adapter.js";
export { SupabaseMemoryAdapter } from "./adapters/memory/supabase.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Plugin Registry
// ─────────────────────────────────────────────────────────────────────────────

export { DefaultPluginRegistryAdapter } from "./adapters/plugin-registry/default-plugin-registry.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Plugin Marketplace
// ─────────────────────────────────────────────────────────────────────────────

export { GitHubRegistryAdapter } from "./adapters/plugin-marketplace/github-registry.adapter.js";
export type { GitHubRegistryOptions } from "./adapters/plugin-marketplace/github-registry.adapter.js";

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
  createAsyncSubagentTools,
  SubagentRegistry,
  SubagentScheduler,
  createDispatchTool,
  createPollTool,
  createAwaitTool,
} from "./tools/subagent/index.js";

export type {
  AsyncSubagentToolsConfig,
  SubagentHandle,
  SubagentTaskStatus,
  SubagentResourceLimits,
  DispatchParams,
  PoolConfig,
} from "./tools/subagent/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tools — Planning
// ─────────────────────────────────────────────────────────────────────────────

export {
  createPlanningTools,
  createWriteTodosTool,
  createReviewTodosTool,
  createPlanCreateTool,
  createPlanUpdateTool,
  createPlanStatusTool,
  createPlanVisualizeTool,
  planToGraph,
  type PlanToGraphOptions,
} from "./tools/planning/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tools — Policy
// ─────────────────────────────────────────────────────────────────────────────

export { createPolicyTools } from "./tools/policy/index.js";

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
export type { GraphCheckpoint } from "./graph/graph-executor.js";
export type { AgentNodeConfig, NodeResult } from "./graph/agent-node.js";
export type { ConsensusPort, ConsensusResult } from "./ports/consensus.port.js";
export { LlmJudgeConsensus } from "./adapters/consensus/llm-judge.adapter.js";
export { MajorityVoteConsensus } from "./adapters/consensus/majority-vote.adapter.js";
export { DebateConsensus } from "./adapters/consensus/debate.adapter.js";
export type { GraphConfig, GraphResult, GraphStreamEvent } from "./domain/graph.schema.js";
export type { GraphVisualizationPort, GraphDescriptor } from "./ports/graph-visualization.port.js";
export { AsciiGraphAdapter } from "./adapters/graph-visualization/ascii-graph.adapter.js";
export { MermaidGraphAdapter } from "./adapters/graph-visualization/mermaid-graph.adapter.js";

// Graph — Execution Primitives
export { WorkerPool } from "./graph/worker-pool.js";
export type { WorkerPoolConfig, WorkerPoolMetrics } from "./graph/worker-pool.js";
export { AsyncChannel } from "./graph/async-channel.js";
export { IncrementalReadyTracker } from "./graph/incremental-ready-tracker.js";
export { PriorityQueue } from "./graph/priority-queue.js";
export { TokenBudgetController } from "./graph/token-budget-controller.js";
export type { BudgetStatus } from "./graph/token-budget-controller.js";
export { ForkCoordinator } from "./graph/fork-coordinator.js";

// Graph — Supervision & Dynamic Graphs
export { AgentSupervisor } from "./graph/agent-supervisor.js";
export type {
  SupervisorStrategy,
  ChildPolicy,
  ChildSpec,
  RestartIntensity,
  SupervisorConfig,
  ChildStatus,
} from "./graph/agent-supervisor.js";
export { SupervisorBuilder } from "./graph/supervisor-builder.js";
export { DynamicAgentGraph } from "./graph/dynamic-agent-graph.js";
export type { MutationType, MutationEntry, MutationResult } from "./graph/dynamic-agent-graph.js";

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
// Evaluation Harness
// ─────────────────────────────────────────────────────────────────────────────

export {
  DEFAULT_SEMANTIC_SEARCH_THRESHOLDS,
  evaluateSemanticSearchSuite,
  assertSemanticSearchQualityGate,
} from "./evals/index.js";
export type {
  SemanticSearchEvalCase,
  SemanticSearchEvalResult,
  SemanticSearchEvalRunOutput,
  SemanticSearchCaseMetrics,
  SemanticSearchQualityThresholds,
  SemanticSearchEvaluationSummary,
  SemanticSearchEvaluationOptions,
  SemanticSearchRunner,
} from "./evals/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Deprecated Aliases (Backward Compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use GaussFlowServer */
export { GaussFlowServer as OneAgentServer } from "./rest/server.js";
/** @deprecated Use GaussFlowMcpAdapter */
export { GaussFlowMcpAdapter as OnegenUiMcpAdapter } from "./adapters/mcp/gaussflow-mcp.adapter.js";

// ---------------------------------------------------------------------------
// Workflow Compiler — NL → StructuredDeclaration → WorkflowDef + Skills + Agents
// ---------------------------------------------------------------------------
export {
  StructuredDeclarationSchema,
  CompilerOutputSchema,
  SkillDeclarationSchema,
  AgentDeclarationSchema,
  A2ARouteSchema,
  TriggerSchema,
  ChannelSchema,
  PolicySchema,
  StepDeclarationSchema,
  MonitorStepSchema,
  FilterStepSchema,
  TransformStepSchema,
  PublishStepSchema,
  CustomStepSchema,
  validateDeclaration,
} from "./domain/compiler.schema.js";
export type {
  StructuredDeclaration,
  Trigger,
  CronTrigger,
  EventTrigger,
  ManualTrigger,
  WebhookTrigger,
  Channel,
  ChannelPolicy,
  Policy,
  StepDeclaration,
  MonitorStep,
  FilterStep,
  TransformStep,
  PublishStep,
  CustomStep,
  SkillDeclaration,
  AgentDeclaration,
  A2ARoute,
  CompilerOutput,
  LLMCompilerOutput,
} from "./domain/compiler.schema.js";
export type {
  NLParserPort,
  WorkflowCompilerPort,
  CompileFromNLPort,
  SkillRegistryPort,
  WorkflowStoragePort,
  StoredWorkflow,
  StorageStrategy,
} from "./ports/compiler.port.js";
export { LLMNLParser } from "./adapters/compiler/llm-nl-parser.js";
export { LLMCompilerEngine } from "./adapters/compiler/llm-compiler-engine.js";
export { CompileFromNLService } from "./adapters/compiler/compile-from-nl.js";
export { LLMSkillMatcher } from "./adapters/compiler/llm-skill-matcher.js";
export { InMemorySkillRegistry } from "./adapters/compiler/inmemory-skill-registry.js";
export { JSONSerializer } from "./adapters/compiler/json-serializer.js";
export { MarkdownSerializer } from "./adapters/compiler/markdown-serializer.js";
export { FileWorkflowStorage } from "./adapters/compiler/file-workflow-storage.js";
export type { FileStorageOptions } from "./adapters/compiler/file-workflow-storage.js";
export { DualWorkflowStorage } from "./adapters/compiler/dual-workflow-storage.js";
export { InMemoryWorkflowStorage } from "./adapters/compiler/inmemory-workflow-storage.js";
export { createWorkflowStorage } from "./adapters/compiler/storage-factory.js";
export type { StorageFactoryOptions } from "./adapters/compiler/storage-factory.js";
export type { SkillMatcherPort, SkillMatch } from "./ports/skill-matcher.port.js";
export type { SerializerPort, SerializerFormat } from "./ports/serializer.port.js";
