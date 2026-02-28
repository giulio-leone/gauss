// =============================================================================
// gauss — Public API
// =============================================================================

// ─── Factory Functions ───────────────────────────────────────────────────────
// import { agent, graph, rag } from 'gauss'

export { agent, graph, rag } from "./gauss.js";

// ─── Agent Primitive (new core API) ──────────────────────────────────────────

export { Agent as AgentPrimitive } from "./core/agent/index.js";
export { graph as agentGraph } from "./core/agent/index.js";
export type {
  AgentConfig as AgentPrimitiveConfig,
  AgentInstance,
  AgentResult as AgentPrimitiveResult,
  AgentStream,
  Decorator,
  RunContext,
  RunOptions,
  StepContext,
  StopCondition,
  StreamChunk,
  ToolCallContext,
  OutputSpec,
  CostInfo,
  GraphConfig,
  GraphResult,
  GraphPipeline,
} from "./core/agent/index.js";

// ─── Decorators ─────────────────────────────────────────────────────────────

export {
  memory as memoryDecorator,
  telemetry as telemetryDecorator,
  resilience as resilienceDecorator,
  costLimit as costLimitDecorator,
  planning as planningDecorator,
  approval as approvalDecorator,
  learning as learningDecorator,
  checkpoint as checkpointDecorator,
} from "./decorators/index.js";

// ─── LLM Core ───────────────────────────────────────────────────────────────

export { Output } from "./core/llm/index.js";
export { generateText, streamText, tool, stepCountIs, hasToolCall } from "./core/llm/index.js";
export type { LanguageModel, ToolSet, TokenUsage as LLMTokenUsage, CoreMessage } from "./core/llm/index.js";

// ─── Errors ─────────────────────────────────────────────────────────────────

export {
  GaussError,
  ToolExecutionError,
  PluginError,
  McpConnectionError,
  RuntimeError,
  StreamingError,
  ConfigurationError,
} from "./errors/index.js";

// ─── Core Types ─────────────────────────────────────────────────────────────

export type {
  AgentConfig,
  ContextConfig,
  ApprovalConfig,
  ApprovalRequest,
  SubagentConfig,
  CheckpointConfig,
  McpToolsetSelection,
  AgentEventType,
  AgentEvent,
  AgentEventHandler,
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

// ─── Agent ──────────────────────────────────────────────────────────────────

export { Agent } from "./agent/agent.js";
export { AgentBuilder } from "./agent/agent-builder.js";
export type { AgentResult, AgentRunOptions } from "./agent/agent.js";
export { ToolManager } from "./agent/tool-manager.js";
export { ExecutionEngine } from "./agent/execution-engine.js";
export { ApprovalManager } from "./agent/approval-manager.js";
export { EventBus } from "./agent/event-bus.js";
export { LifecycleManager } from "./agent/lifecycle.js";
export type { LifecycleHooks, HealthStatus } from "./agent/lifecycle.js";
export { ProgressEmitter } from "./agent/progress.js";
export type { ProgressEvent, ProgressPhase, ProgressListener } from "./agent/progress.js";
export { createAllTodosDoneCondition } from "./agent/stop-conditions.js";

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

// ─── Ports (Hexagonal Architecture Contracts) ───────────────────────────────

export type { RuntimePort } from "./ports/runtime.port.js";
export type { MemoryPort } from "./ports/memory.port.js";
export type { LearningPort } from "./ports/learning.port.js";
export type { FilesystemPort } from "./ports/filesystem.port.js";
export type { TokenCounterPort, TokenBudget, TokenUsage } from "./ports/token-counter.port.js";
export type { TracingPort, Span } from "./ports/tracing.port.js";
export type { MetricsPort } from "./ports/metrics.port.js";
export type { TelemetryPort, TelemetrySpan } from "./ports/telemetry.port.js";
export type { LoggingPort, LogLevel, LogEntry } from "./ports/logging.port.js";
export type { ModelPort, ModelGenerateOptions, ModelGenerateResult, ModelStreamResult } from "./ports/model.port.js";
export type {
  AgentMemoryPort,
  MemoryEntry,
  MemoryTier,
  MemoryStats,
  RecallOptions,
} from "./ports/agent-memory.port.js";
export type { McpPort, McpToolDefinition, McpToolResult, McpToolResultContent, McpServerInfo, McpServerConfig } from "./ports/mcp.port.js";
export type { McpServerPort, McpServerOptions, McpToolServerDefinition } from "./ports/mcp-server.port.js";
export type { PolicyEffect, PolicyContext, PolicyRequest, PolicyRule, PolicyDecision, PolicyAuditRecord, PolicyEnginePort } from "./ports/policy.port.js";
export type { ValidationPort, ValidationResult } from "./ports/validation.port.js";
export type { PluginManifest, PluginRegistryPort, PluginSource } from "./ports/plugin-registry.port.js";
export type { MarketplacePluginManifest, MarketplacePort } from "./ports/plugin-manifest.port.js";
export type { ISemanticScrapingPort, ManifestTool, PageToolSet, SiteToolManifest, SemanticTool } from "./ports/semantic-scraping.port.js";
export type { ChunkingPort, ChunkOptions, Chunk } from "./ports/chunking.port.js";
export type { PartialJsonPort, JsonAccumulator } from "./ports/partial-json.port.js";
export type { ReRankingPort, ReRankingOptions, ScoredResult, SourceAttribution } from "./ports/reranking.port.js";
export type { ToolCompositionPort, ToolPipeline, ToolMiddleware } from "./ports/tool-composition.port.js";
export type { CostTrackerPort, CostTokenUsage, CostEstimate } from "./ports/cost-tracker.port.js";
export type { EmbeddingPort } from "./ports/embedding.port.js";
export type { VectorStorePort } from "./ports/vector-store.port.js";
export type { DocumentPort } from "./ports/document.port.js";
export type { WorkingMemoryPort } from "./ports/working-memory.port.js";
export type { ConsensusPort, ConsensusResult } from "./ports/consensus.port.js";
export type { GraphVisualizationPort, GraphDescriptor } from "./ports/graph-visualization.port.js";
export type { SuspensionPort, SuspendedState, ResumeDecision } from "./ports/suspension.port.js";
export type { SkillsPort, Skill } from "./ports/skills.port.js";
export type { SandboxPort, ExecuteResult } from "./ports/sandbox.port.js";
export type { HotReloadPort, HotReloadAgentConfig } from "./ports/hot-reload.port.js";
export type { KnowledgeGraphPort, GraphNode, GraphEdge, GraphQueryOptions, SubgraphResult } from "./ports/knowledge-graph.port.js";
export type { EntityExtractorPort, Entity, Relation, ExtractionResult } from "./ports/entity-extractor.port.js";
export type { StorageDomainPort } from "./ports/storage-domain.port.js";
export type { QueuePort, QueueJob, QueueJobOptions, QueueJobResult, QueueProcessor } from "./ports/queue.port.js";
export type { ObjectStoragePort, ObjectStorageMetadata, StoredObject, ListObjectsResult } from "./ports/object-storage.port.js";
export type { HttpServerPort, HttpRequest, HttpResponse, HttpHandler, HttpMiddleware, HttpMethod, Route } from "./ports/http-server.port.js";
export type { AuthPort, AuthorizationPort, AuthUser, AuthResult } from "./ports/auth.port.js";
export type { AgentNetworkPort, NetworkTopology, NetworkAgent, DelegationRequest, DelegationResult as NetworkDelegationResult } from "./ports/agent-network.port.js";
export type { AcpServerPort, AcpMessage, AcpSession, AcpHandler } from "./ports/acp.port.js";
export type { VoicePort, VoiceConfig, VoiceEvent, VoiceEventListener } from "./ports/voice.port.js";
export { OpenAIVoiceAdapter } from "./adapters/voice/openai/openai-voice.adapter.js";
export type { OpenAIVoiceOptions } from "./adapters/voice/openai/openai-voice.adapter.js";
export { ElevenLabsVoiceAdapter } from "./adapters/voice/elevenlabs/elevenlabs-voice.adapter.js";
export type { ElevenLabsVoiceOptions } from "./adapters/voice/elevenlabs/elevenlabs-voice.adapter.js";
export { VoicePipeline } from "./adapters/voice/voice-pipeline.js";
export type { VoicePipelineConfig, VoicePipelineResult } from "./adapters/voice/voice-pipeline.js";
export type { DatasetsPort, DatasetEntry, DatasetInfo, DatasetQuery } from "./ports/datasets.port.js";
export type { DeployerPort, DeploymentConfig, DeploymentInfo, DeploymentStatus } from "./ports/deployer.port.js";
export type { WorkflowPort, WorkflowEventListener } from "./ports/workflow.port.js";
export type { MiddlewarePort, MiddlewareContext, MiddlewarePriority, MiddlewareChainPort, BeforeAgentChainResult } from "./ports/middleware.port.js";
export type { NLParserPort, WorkflowCompilerPort, CompileFromNLPort, SkillRegistryPort, WorkflowStoragePort, StoredWorkflow, StorageStrategy } from "./ports/compiler.port.js";
export type { SkillMatcherPort, SkillMatch } from "./ports/skill-matcher.port.js";
export type { SerializerPort, SerializerFormat } from "./ports/serializer.port.js";
export type { ServerAdapterPort } from "./ports/server.port.js";
export type { SaveQueuePort, SaveEntry, FlushResult } from "./ports/save-queue.port.js";
export type { BundlerPort, BundleEntry, BundleOptions, BundleResult } from "./ports/bundler.port.js";
export { Lifetime } from "./ports/di.port.js";
export type { ContainerPort, Token, Factory, Registration } from "./ports/di.port.js";

// ─── Plugins ────────────────────────────────────────────────────────────────

export type {
  Plugin,
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

export { MemoryPlugin, createMemoryPlugin } from "./plugins/memory.plugin.js";
export type { MemoryPluginOptions } from "./plugins/memory.plugin.js";
export { PluginRegistryPlugin, createPluginRegistryPlugin } from "./plugins/plugin-registry.plugin.js";
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

// ─── Middleware ──────────────────────────────────────────────────────────────

export { MiddlewareChain, composeMiddleware } from "./middleware/chain.js";
export { createLoggingMiddleware } from "./middleware/logging.js";
export type { LoggingMiddlewareOptions, LogEntry as MiddlewareLogEntry } from "./middleware/logging.js";
export { createCachingMiddleware } from "./middleware/caching.js";
export type { CachingMiddlewareOptions, CacheStats } from "./middleware/caching.js";
export { createHITLMiddleware } from "./middleware/hitl.js";
export type { HITLDecision, HITLApprovalHandler, HITLMiddlewareOptions } from "./middleware/hitl.js";
export { createProcessorPipeline } from "./middleware/processor.js";
export type { InputProcessor, OutputProcessor, ProcessorPipelineOptions } from "./middleware/processor.js";
export { createSkillsMiddleware } from "./middleware/skills.js";
export type { SkillsMiddlewareOptions } from "./middleware/skills.js";
export { createObservationalMemoryMiddleware } from "./middleware/observational-memory.js";
export type { ObservationalMemoryOptions, ObservationMetadata } from "./middleware/observational-memory.js";
export { createResultEvictionMiddleware } from "./middleware/result-eviction.js";
export type { ResultEvictionOptions } from "./middleware/result-eviction.js";
export { SummarizationMiddleware } from "./middleware/summarization.js";
export { createTripWireMiddleware } from "./middleware/trip-wire.js";
export type { TripWireOptions, TripWireViolation } from "./middleware/trip-wire.js";
export { createPromptCachingMiddleware } from "./middleware/prompt-caching.js";
export type { PromptCachingOptions } from "./middleware/prompt-caching.js";
export { createToolCallPatchingMiddleware } from "./middleware/tool-call-patching.js";
export type { ToolCallPatchingOptions } from "./middleware/tool-call-patching.js";

// ─── Graph — Multi-Agent Collaboration ──────────────────────────────────────

export { AgentGraph, AgentGraphBuilder } from "./graph/agent-graph.js";
export { SharedContext } from "./graph/shared-context.js";
export { GraphExecutor } from "./graph/graph-executor.js";
export type { GraphCheckpoint } from "./graph/graph-executor.js";
export type { AgentNodeConfig, NodeResult } from "./graph/agent-node.js";
export type { GraphConfig, GraphResult, GraphStreamEvent } from "./domain/graph.schema.js";

export { LlmJudgeConsensus } from "./adapters/consensus/llm-judge.adapter.js";
export { MajorityVoteConsensus } from "./adapters/consensus/majority-vote.adapter.js";
export { DebateConsensus } from "./adapters/consensus/debate.adapter.js";
export { AsciiGraphAdapter } from "./adapters/graph-visualization/ascii-graph.adapter.js";
export { MermaidGraphAdapter } from "./adapters/graph-visualization/mermaid-graph.adapter.js";

export { WorkerPool } from "./graph/worker-pool.js";
export type { WorkerPoolConfig, WorkerPoolMetrics } from "./graph/worker-pool.js";
export { AsyncChannel } from "./graph/async-channel.js";
export { IncrementalReadyTracker } from "./graph/incremental-ready-tracker.js";
export { PriorityQueue } from "./graph/priority-queue.js";
export { TokenBudgetController } from "./graph/token-budget-controller.js";
export type { BudgetStatus } from "./graph/token-budget-controller.js";
export { ForkCoordinator } from "./graph/fork-coordinator.js";

export { AgentSupervisor } from "./graph/agent-supervisor.js";
export type { SupervisorStrategy, ChildPolicy, ChildSpec, RestartIntensity, SupervisorConfig, ChildStatus } from "./graph/agent-supervisor.js";
export { SupervisorBuilder } from "./graph/supervisor-builder.js";
export { DynamicAgentGraph } from "./graph/dynamic-agent-graph.js";
export type { MutationType, MutationEntry, MutationResult } from "./graph/dynamic-agent-graph.js";
export { Team, TeamBuilder, team } from "./graph/team-builder.js";
export type { CoordinationStrategy, TeamMember, TeamConfig, TeamResult, TeamRound } from "./graph/team-builder.js";

// ─── RAG & Knowledge ────────────────────────────────────────────────────────

export { RAGPipeline } from "./rag/pipeline.js";
export { GraphRAGPipeline } from "./rag/graph-rag.pipeline.js";
export type { GraphRAGConfig, GraphIngestResult, GraphQueryResult } from "./rag/graph-rag.pipeline.js";

export { InMemoryEmbeddingAdapter } from "./adapters/embedding/inmemory.adapter.js";
export { InMemoryVectorStore } from "./adapters/vector-store/inmemory.adapter.js";
export { MarkdownDocumentAdapter } from "./adapters/document/markdown.adapter.js";
export { InMemoryWorkingMemory } from "./adapters/working-memory/inmemory.adapter.js";
export { InMemoryKnowledgeGraphAdapter } from "./adapters/knowledge-graph/inmemory.adapter.js";
export { PatternEntityExtractorAdapter, DEFAULT_ENTITY_PATTERNS } from "./adapters/entity-extractor/pattern.adapter.js";
export type { PatternRule, RelationPattern, PatternEntityExtractorConfig } from "./adapters/entity-extractor/pattern.adapter.js";

// ─── Tools ──────────────────────────────────────────────────────────────────

export {
  createFilesystemTools,
  createLsTool,
  createReadFileTool,
  createWriteFileTool,
  createEditFileTool,
  createGlobTool,
  createGrepTool,
} from "./tools/filesystem/index.js";

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

export { createPolicyTools } from "./tools/policy/index.js";

// ─── Context Management ─────────────────────────────────────────────────────

export { TokenTracker } from "./context/token-tracker.js";
export { ContextManager } from "./context/context-manager.js";
export { RollingSummarizer } from "./context/rolling-summarizer.js";
export type { ContextManagerDeps, RollingSummarizerDeps, TokenTrackerSnapshot } from "./context/types.js";

// ─── Templates ──────────────────────────────────────────────────────────────

export { PromptTemplate } from "./templates/index.js";
export type { PromptTemplateConfig } from "./templates/index.js";

// ─── Streaming ──────────────────────────────────────────────────────────────

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

// ─── HTTP Server & REST API ─────────────────────────────────────────────────

export { GaussServer } from "./rest/server.js";
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
export { NodeHttpServer } from "./server/node-http.server.js";
export { AcpServer } from "./protocols/acp/acp-server.js";

// ─── Adapters — Core ────────────────────────────────────────────────────────

export { VirtualFilesystem, type DiskSyncFn } from "./adapters/filesystem/virtual-fs.adapter.js";
export { InMemoryAdapter } from "./adapters/memory/in-memory.adapter.js";
export { InMemoryAgentMemoryAdapter } from "./adapters/memory/in-memory-agent-memory.adapter.js";
export { TieredAgentMemoryAdapter } from "./adapters/memory/tiered-agent-memory.adapter.js";
export { SupabaseMemoryAdapter } from "./adapters/memory/supabase.adapter.js";
export { InMemoryLearningAdapter } from "./adapters/learning/index.js";
export { ApproximateTokenCounter } from "./adapters/token-counter/approximate.adapter.js";

// ─── Adapters — MCP & Policy ────────────────────────────────────────────────

export { GaussMcpAdapter } from "./adapters/mcp/gauss-mcp.adapter.js";
export { AiSdkMcpAdapter } from "./adapters/mcp/ai-sdk-mcp.adapter.js";
export { McpPolicyEngine } from "./adapters/policy/mcp-policy-engine.js";
export { DefaultMcpServerAdapter } from "./adapters/mcp-server/index.js";
export type { McpToolExecutor } from "./adapters/mcp-server/index.js";

// ─── Adapters — Model ───────────────────────────────────────────────────────

export { AiSdkModelAdapter } from "./adapters/model/ai-sdk.adapter.js";
export { ModelRouter } from "./adapters/model/router.adapter.js";

// ─── Adapters — Auth & Network ──────────────────────────────────────────────

export { ApiKeyAuthAdapter, JwtAuthAdapter, CompositeAuthAdapter, RbacAuthorizationAdapter } from "./adapters/auth/auth.adapter.js";
export { AgentNetworkAdapter } from "./adapters/agent-network/agent-network.adapter.js";

// ─── Adapters — Observability ───────────────────────────────────────────────

export { ConsoleTelemetryAdapter } from "./adapters/telemetry/console-telemetry.adapter.js";
export { OtelTelemetryAdapter } from "./adapters/telemetry/otel-telemetry.adapter.js";
export { ConsoleLoggingAdapter } from "./adapters/logging/index.js";
export { InMemoryTracingAdapter } from "./adapters/tracing/index.js";
export { InMemoryMetricsAdapter } from "./adapters/metrics/index.js";
export { PrometheusMetricsAdapter } from "./adapters/metrics/prometheus.adapter.js";
export { DefaultCostTrackerAdapter } from "./adapters/cost-tracker/index.js";
export type { CostTrackerOptions } from "./adapters/cost-tracker/index.js";

// ─── Adapters — Data Processing ─────────────────────────────────────────────

export { SemanticScrapingAdapter, urlToPattern, hashTools } from "./adapters/semantic-scraping/index.js";
export { DefaultChunkingAdapter } from "./adapters/chunking/index.js";
export { DefaultReRankingAdapter } from "./adapters/reranking/index.js";
export { ZodValidationAdapter } from "./adapters/validation/index.js";
export { DefaultToolCompositionAdapter } from "./adapters/tool-composition/default-tool-composition.adapter.js";
export { createDefaultPartialJsonAdapter, DefaultPartialJsonAdapter } from "./adapters/partial-json/index.js";

// ─── Adapters — Runtime ─────────────────────────────────────────────────────

export { BaseRuntimeAdapter } from "./adapters/runtime/base-runtime.adapter.js";
export { NodeRuntimeAdapter } from "./adapters/runtime/node-runtime.adapter.js";
export { DenoRuntimeAdapter } from "./adapters/runtime/deno-runtime.adapter.js";
export { BunRuntimeAdapter } from "./adapters/runtime/bun-runtime.adapter.js";
export { EdgeRuntimeAdapter } from "./adapters/runtime/edge-runtime.adapter.js";
export { detectRuntimeName, createRuntimeAdapter, createRuntimeAdapterAsync, type RuntimeName } from "./adapters/runtime/detect-runtime.js";
export { detectRuntime, detectCapabilities } from "./runtime/detect.js";
export type { RuntimeId, RuntimeCapabilities } from "./runtime/detect.js";

// ─── Adapters — Workflow & Compiler ─────────────────────────────────────────

export { DefaultWorkflowEngine } from "./adapters/workflow/index.js";
export type { DefaultWorkflowEngineOptions, AgentExecutor } from "./adapters/workflow/index.js";
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

// ─── Adapters — Misc ────────────────────────────────────────────────────────

export { InMemorySuspensionAdapter } from "./adapters/suspension/inmemory.adapter.js";
export { FileSkillAdapter } from "./adapters/skills/file-skill.adapter.js";
export { LocalShellSandboxAdapter } from "./adapters/sandbox/local-shell.adapter.js";
export { E2BSandboxAdapter } from "./adapters/sandbox/e2b.adapter.js";
export type { E2BSandboxConfig } from "./adapters/sandbox/e2b.adapter.js";
export { createSandbox } from "./adapters/sandbox/factory.js";
export type { SandboxFactoryConfig } from "./adapters/sandbox/factory.js";
export { FileWatcherAdapter } from "./adapters/hot-reload/index.js";
export { AgentConfigLoader } from "./agent/agent-config-loader.js";
export type { ModelResolver } from "./agent/agent-config-loader.js";
export { DefaultPluginRegistryAdapter } from "./adapters/plugin-registry/default-plugin-registry.adapter.js";
export { CompositeStorageAdapter } from "./ports/storage-domain.port.js";
export { InMemoryStorageAdapter } from "./adapters/storage/inmemory.adapter.js";
export { PostgresStorageAdapter, type PostgresStorageOptions } from "./adapters/storage/postgres/postgres-storage.adapter.js";
export { RedisStorageAdapter, type RedisStorageOptions } from "./adapters/storage/redis/redis-storage.adapter.js";
export { PgVectorStoreAdapter, type PgVectorStoreOptions } from "./adapters/vector-store/pgvector/pgvector-store.adapter.js";
export { S3ObjectStorageAdapter, type S3ObjectStorageOptions } from "./adapters/object-storage/s3/s3-object-storage.adapter.js";
export { BullMQQueueAdapter, type BullMQQueueOptions } from "./adapters/queue/bullmq/bullmq-queue.adapter.js";
export { FileLearningAdapter } from "./adapters/learning/file-learning.adapter.js";
export { InMemoryVoiceAdapter } from "./adapters/voice/inmemory.adapter.js";
export { InMemoryDatasetsAdapter } from "./adapters/datasets/inmemory.adapter.js";
export { InMemoryDeployerAdapter } from "./adapters/deployer/inmemory.adapter.js";

// ─── Adapters — Plugin Marketplace ──────────────────────────────────────────

export { GitHubRegistryAdapter } from "./adapters/plugin-marketplace/github-registry.adapter.js";
export type { GitHubRegistryOptions } from "./adapters/plugin-marketplace/github-registry.adapter.js";
export { NpmRegistryAdapter } from "./adapters/plugin-marketplace/npm-registry.adapter.js";
export type { NpmRegistryOptions } from "./adapters/plugin-marketplace/npm-registry.adapter.js";
export { CompositeMarketplaceAdapter } from "./adapters/plugin-marketplace/composite-marketplace.adapter.js";
export type { CompositeMarketplaceOptions } from "./adapters/plugin-marketplace/composite-marketplace.adapter.js";
export { PluginLoader } from "./adapters/plugin-marketplace/plugin-loader.js";
export type { LoadedPlugin, PluginLoaderOptions } from "./adapters/plugin-marketplace/plugin-loader.js";

// ─── Testing ────────────────────────────────────────────────────────────────

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

// ─── Evaluation Harness ─────────────────────────────────────────────────────

export {
  DEFAULT_SEMANTIC_SEARCH_THRESHOLDS,
  evaluateSemanticSearchSuite,
  assertSemanticSearchQualityGate,
  DEFAULT_SEMANTIC_BENCHMARK_BUDGETS,
  summaryToBenchmarkSnapshot,
  compareSemanticSearchBenchmark,
  assertSemanticSearchBenchmarkGate,
  renderSemanticSearchBenchmarkMarkdown,
  DEFAULT_SEMANTIC_STRESS_THRESHOLDS,
  evaluateSemanticSearchStressSuite,
  assertSemanticSearchStressGate,
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
  SemanticSearchBenchmarkBaseline,
  SemanticSearchBenchmarkBudgets,
  SemanticSearchBenchmarkComparison,
  SemanticSearchStressSample,
  SemanticSearchStressThresholds,
  SemanticSearchStressSummary,
} from "./evals/index.js";

export {
  ScorerPipeline, createScorer,
  exactMatchScorer, containsScorer, lengthScorer, llmJudgeScorer,
} from "./evals/scorer.js";
export type { Scorer, ScoreResult, ScorerContext } from "./evals/scorer.js";
export {
  TrajectoryRecorder, hasAgentSteps, hasToolCallRequests, hasNoErrors,
  hasToolCallCount, completedWithin, hasOrderedSteps,
  exportTrajectory, importTrajectory,
} from "./evals/trajectory.js";
export type { Trajectory, TrajectoryStep } from "./evals/trajectory.js";

// ─── Playground ─────────────────────────────────────────────────────────────

export { registerPlaygroundRoutes } from "./server/playground-api.js";
export type { PlaygroundAgent, PlaygroundConfig, PlaygroundTraceSpan, PlaygroundTokenUsage, PlaygroundToolCall, PlaygroundReliabilityMetrics } from "./server/playground-api.js";
export { PlaygroundCollector, type PlaygroundCollectorOptions } from "./server/playground-collector.js";
export { startPlayground } from "./cli/playground.js";
export type { PlaygroundOptions } from "./cli/playground.js";

// ─── Domain Schemas ─────────────────────────────────────────────────────────

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
  StepExecutionModeSchema,
  StepStatusSchema as PlanStepStatusSchema,
  StepPrioritySchema,
  PlanStatusSchema,
  PlanEventTypeSchema,
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
  STEP_STATUS_TRANSITIONS,
  PLAN_STATUS_TRANSITIONS,
  isValidStepTransition,
  isValidPlanTransition,
  transitionStep,
  createStep,
  createPhase,
  createSubStep,
  createPlan,
  generateStepId,
  validatePlan,
  calculateProgress,
  todosToplan as todosToPlan,
  createExamplePlan,
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

export { CheckpointSchema, type Checkpoint } from "./domain/checkpoint.schema.js";
export { UserProfileSchema, UserMemorySchema, SharedKnowledgeSchema, type UserProfile, type UserMemory, type UserMemoryInput, type SharedKnowledge, type SharedKnowledgeInput } from "./domain/learning.schema.js";
export { MessageSchema, CompressedContextSchema, ConversationStateSchema, type MessageType, type CompressedContextType, type ConversationState } from "./domain/conversation.schema.js";
export { AgentEventTypeSchema, AgentEventSchema, type AgentEventTypeValue, type AgentEventValue } from "./domain/events.schema.js";
export { EvalMetricsSchema, EvalResultSchema, type EvalMetrics, type EvalResult } from "./domain/eval.schema.js";

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

export { WorkflowBuilder, defineWorkflow } from "./domain/workflow.builder.js";

export { WorkflowDSL, workflow } from "./domain/workflow-dsl.js";
export type { StepDefinition, BranchDefinition } from "./domain/workflow-dsl.js";

export { LLMRecorder, LLMReplayer } from "./tools/llm-recorder.js";
export type { LLMCallRecord, RecorderOptions, ReplayerOptions } from "./tools/llm-recorder.js";

export { VisualAgentBuilder, ModelRegistry, AgentConfigSchema } from "./tools/visual-agent-builder.js";
export type { AgentConfigJSON, AgentNode, CompiledAgent, AgentBuilderResult } from "./tools/visual-agent-builder.js";
export { AgentBuilderAPI } from "./tools/agent-builder-api.js";

export { MultimodalAgent, multimodal } from "./domain/multimodal.js";
export type {
  ImageSource,
  ImageInput,
  MultimodalContent,
  MultimodalMessage,
  MultimodalResult,
} from "./domain/multimodal.js";

export { VideoProcessor, DefaultFrameExtractor, videoProcessor } from "./domain/video-processor.js";
export type {
  VideoSource,
  VideoInput,
  VideoFrame,
  FrameExtractionOptions,
  VideoAnalysisResult,
  AudioExtractionResult,
  FrameExtractorPort,
} from "./domain/video-processor.js";

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

// ─── Utils ──────────────────────────────────────────────────────────────────

export { AbstractBuilder } from "./utils/abstract-builder.js";

// ─── Doc Generator ──────────────────────────────────────────────────────────

export { DocGenerator } from "./docs/doc-generator.js";
export type { DocGeneratorOptions, DocPage } from "./docs/doc-generator.js";

// ─── Agent Debugger ─────────────────────────────────────────────────────────

export type {
  AgentDebuggerPort,
  DebugSession,
  DebugCheckpoint,
  DebugState,
  BreakpointCondition,
  BreakpointHit,
  DebugDiff,
  DebugSessionSummary,
} from "./ports/agent-debugger.port.js";
export {
  DebugSessionImpl,
  InMemoryAgentDebuggerAdapter,
  createDebugMiddleware,
} from "./adapters/agent-debugger/index.js";

// ─── Agent Orchestrator ─────────────────────────────────────────────────────

export type {
  AgentOrchestorPort,
  OrchestrationPattern,
  OrchestrationConfig,
  OrchestrationAgent,
  OrchestrationMessage,
  OrchestrationOptions,
  Orchestration,
  OrchestrationResult,
  OrchestrationEvent,
} from "./ports/agent-orchestrator.port.js";
export {
  AgentOrchestratorAdapter,
  createSupervisorOrchestration,
  createSwarmOrchestration,
  createPipelineOrchestration,
  createMapReduceOrchestration,
  createDebateOrchestration,
} from "./adapters/agent-orchestrator/index.js";

// ─── Structured Output ──────────────────────────────────────────────────────

export type {
  StructuredOutputPort,
  OutputSchema,
  ParseResult,
  RepairResult,
  RepairAction,
  ValidationError,
  OutputConstraint,
  FormatOptions,
  ValidationResult,
  StreamParser,
} from "./ports/structured-output.port.js";
export {
  StructuredOutputAdapter,
  JsonStreamParser,
  repairJson,
  parseJson,
  parseYaml,
  parseCsv,
  parseMarkdownTable,
} from "./adapters/structured-output/index.js";

// ─── Advanced Agent Memory ──────────────────────────────────────────────────

export type {
  AgentMemoryPort as AdvancedAgentMemoryPort,
  MemoryType,
  MemoryEntry,
  MemoryQuery,
  ConsolidationResult,
  MemoryStats,
  ScopedMemory,
} from "./ports/advanced-agent-memory.port.js";
export {
  InMemoryAdvancedAgentMemoryAdapter,
  cosineSimilarity,
  consolidateMemories,
} from "./adapters/agent-memory/index.js";

// ─── Guardrails ─────────────────────────────────────────────────────────────

export type {
  GuardrailsPort,
  Guardrail,
  GuardrailStage,
  GuardrailAction,
  GuardrailContext,
  GuardrailCheckResult,
  GuardrailResult,
} from "./ports/guardrails.port.js";
export {
  GuardrailsAdapter,
  PiiDetector,
  InjectionDetector,
  ContentModerator,
  TokenBudget,
  SchemaValidator,
} from "./adapters/guardrails/index.js";

// ─── Observability Pipeline ─────────────────────────────────────────────────

export type {
  ObservabilityPipelinePort,
  Trace,
  Span,
  SpanKind,
  SpanEvent,
  LogLevel,
  LogEntry,
  TraceData,
  SpanData,
  MetricsSummary,
  TraceExporter,
} from "./ports/observability-pipeline.port.js";
export {
  ObservabilityPipelineAdapter,
  TraceImpl,
  SpanImpl,
  MetricsCollector,
  ConsoleExporter,
  JsonExporter,
} from "./adapters/observability-pipeline/index.js";

// ─── Rate Limiter ───────────────────────────────────────────────────────────

export type {
  RateLimiterPort,
  RateLimiterConfig,
  RateLimitAlgorithm,
  RateLimitResult,
  RateLimitState,
} from "./ports/rate-limiter.port.js";
export { InMemoryRateLimiter } from "./adapters/rate-limiter/index.js";

// ─── Budget Cost Tracker ────────────────────────────────────────────────────

export type {
  BudgetCostTrackerPort,
  CostEvent,
  CostPeriod,
  CostSummary,
  Budget,
  BudgetResult,
} from "./ports/budget-cost-tracker.port.js";
export { InMemoryCostTracker } from "./adapters/cost-tracker/cost-tracker.adapter.js";
