// =============================================================================
// Adapters — Public API (sub-entry point: gauss-ai/adapters)
// =============================================================================

// Memory
export { InMemoryAdapter, SupabaseMemoryAdapter, InMemoryAgentMemoryAdapter, TieredAgentMemoryAdapter } from "./memory/index.js";
export type { InMemoryAgentMemoryOptions } from "./memory/in-memory-agent-memory.adapter.js";
export type { TieredAgentMemoryAdapterOptions } from "./memory/tiered-agent-memory.adapter.js";
export { FileMemoryAdapter } from "./memory/index.js";
export type { FileMemoryAdapterOptions } from "./memory/file-memory.adapter.js";

// Advanced Agent Memory
export { InMemoryAdvancedAgentMemoryAdapter, cosineSimilarity, consolidateMemories } from "./agent-memory/index.js";
export type { InMemoryAgentMemoryAdapterOptions as AdvancedAgentMemoryAdapterOptions, ConsolidatorOptions } from "./agent-memory/index.js";

// Working Memory
export { InMemoryWorkingMemory } from "./working-memory/inmemory.adapter.js";

// Learning
export { InMemoryLearningAdapter } from "./learning/index.js";
export { FileLearningAdapter } from "./learning/file-learning.adapter.js";

// Token Counter
export { ApproximateTokenCounter } from "./token-counter/approximate.adapter.js";

// MCP
export { GaussMcpAdapter } from "./mcp/gauss-mcp.adapter.js";
export { AiSdkMcpAdapter } from "./mcp/ai-sdk-mcp.adapter.js";
export { McpPolicyEngine } from "./policy/mcp-policy-engine.js";
export { DefaultMcpServerAdapter } from "./mcp-server/index.js";
export type { McpToolExecutor } from "./mcp-server/index.js";

// Model
export { AiSdkModelAdapter } from "./model/ai-sdk.adapter.js";
export { ModelRouter } from "./model/router.adapter.js";

// Auth
export { ApiKeyAuthAdapter, JwtAuthAdapter, CompositeAuthAdapter, RbacAuthorizationAdapter } from "./auth/auth.adapter.js";

// Agent Network
export { AgentNetworkAdapter } from "./agent-network/agent-network.adapter.js";

// Telemetry & Observability
export { ConsoleTelemetryAdapter } from "./telemetry/console-telemetry.adapter.js";
export { OtelTelemetryAdapter } from "./telemetry/otel-telemetry.adapter.js";
export { ConsoleLoggingAdapter } from "./logging/index.js";
export { InMemoryTracingAdapter } from "./tracing/index.js";
export { InMemoryMetricsAdapter } from "./metrics/index.js";
export { PrometheusMetricsAdapter } from "./metrics/prometheus.adapter.js";
export { DefaultCostTrackerAdapter } from "./cost-tracker/index.js";
export type { CostTrackerOptions } from "./cost-tracker/index.js";
export { InMemoryCostTracker } from "./cost-tracker/cost-tracker.adapter.js";

// Filesystem
export { VirtualFilesystem, type DiskSyncFn } from "./filesystem/virtual-fs.adapter.js";

// Data Processing
export { SemanticScrapingAdapter, urlToPattern, hashTools } from "./semantic-scraping/index.js";
export { DefaultChunkingAdapter } from "./chunking/index.js";
export { DefaultReRankingAdapter } from "./reranking/index.js";
export { ZodValidationAdapter } from "./validation/index.js";
export { DefaultToolCompositionAdapter } from "./tool-composition/default-tool-composition.adapter.js";
export { createDefaultPartialJsonAdapter, DefaultPartialJsonAdapter } from "./partial-json/index.js";

// Runtime
export { BaseRuntimeAdapter } from "./runtime/base-runtime.adapter.js";
export { NodeRuntimeAdapter } from "./runtime/node-runtime.adapter.js";
export { detectRuntimeName, createRuntimeAdapter, createRuntimeAdapterAsync, type RuntimeName } from "./runtime/detect-runtime.js";

// Workflow & Compiler
export { DefaultWorkflowEngine } from "./workflow/index.js";
export type { DefaultWorkflowEngineOptions, AgentExecutor } from "./workflow/index.js";
export { LLMNLParser } from "./compiler/llm-nl-parser.js";
export { LLMCompilerEngine } from "./compiler/llm-compiler-engine.js";
export { CompileFromNLService } from "./compiler/compile-from-nl.js";
export { LLMSkillMatcher } from "./compiler/llm-skill-matcher.js";
export { InMemorySkillRegistry } from "./compiler/inmemory-skill-registry.js";
export { JSONSerializer } from "./compiler/json-serializer.js";
export { MarkdownSerializer } from "./compiler/markdown-serializer.js";
export { FileWorkflowStorage } from "./compiler/file-workflow-storage.js";
export type { FileStorageOptions } from "./compiler/file-workflow-storage.js";
export { DualWorkflowStorage } from "./compiler/dual-workflow-storage.js";
export { InMemoryWorkflowStorage } from "./compiler/inmemory-workflow-storage.js";
export { createWorkflowStorage } from "./compiler/storage-factory.js";
export type { StorageFactoryOptions } from "./compiler/storage-factory.js";

// Suspension
export { InMemorySuspensionAdapter } from "./suspension/inmemory.adapter.js";

// Skills
export { FileSkillAdapter } from "./skills/file-skill.adapter.js";

// Sandbox
export { LocalShellSandboxAdapter } from "./sandbox/local-shell.adapter.js";
export { E2BSandboxAdapter } from "./sandbox/e2b.adapter.js";
export type { E2BSandboxConfig } from "./sandbox/e2b.adapter.js";
export { createSandbox } from "./sandbox/factory.js";
export type { SandboxFactoryConfig } from "./sandbox/factory.js";

// Hot Reload
export { FileWatcherAdapter } from "./hot-reload/index.js";

// Plugin Registry & Marketplace
export { DefaultPluginRegistryAdapter } from "./plugin-registry/default-plugin-registry.adapter.js";
export { GitHubRegistryAdapter } from "./plugin-marketplace/github-registry.adapter.js";
export type { GitHubRegistryOptions } from "./plugin-marketplace/github-registry.adapter.js";
export { NpmRegistryAdapter } from "./plugin-marketplace/npm-registry.adapter.js";
export type { NpmRegistryOptions } from "./plugin-marketplace/npm-registry.adapter.js";
export { CompositeMarketplaceAdapter } from "./plugin-marketplace/composite-marketplace.adapter.js";
export type { CompositeMarketplaceOptions } from "./plugin-marketplace/composite-marketplace.adapter.js";
export { PluginLoader } from "./plugin-marketplace/plugin-loader.js";
export type { LoadedPlugin, PluginLoaderOptions } from "./plugin-marketplace/plugin-loader.js";

// Storage
export { CompositeStorageAdapter } from "../ports/storage-domain.port.js";
export { InMemoryStorageAdapter } from "./storage/inmemory.adapter.js";
export { PostgresStorageAdapter, type PostgresStorageOptions } from "./storage/postgres/postgres-storage.adapter.js";
export { RedisStorageAdapter, type RedisStorageOptions } from "./storage/redis/redis-storage.adapter.js";
export { PgVectorStoreAdapter, type PgVectorStoreOptions } from "./vector-store/pgvector/pgvector-store.adapter.js";
export { S3ObjectStorageAdapter, type S3ObjectStorageOptions } from "./object-storage/s3/s3-object-storage.adapter.js";
export { BullMQQueueAdapter, type BullMQQueueOptions } from "./queue/bullmq/bullmq-queue.adapter.js";

// Embedding & Vector Store (in-memory)
export { InMemoryEmbeddingAdapter } from "./embedding/inmemory.adapter.js";
export { InMemoryVectorStore } from "./vector-store/inmemory.adapter.js";
export { MarkdownDocumentAdapter } from "./document/markdown.adapter.js";
export { InMemoryKnowledgeGraphAdapter } from "./knowledge-graph/inmemory.adapter.js";
export { PatternEntityExtractorAdapter, DEFAULT_ENTITY_PATTERNS } from "./entity-extractor/pattern.adapter.js";
export type { PatternRule, RelationPattern, PatternEntityExtractorConfig } from "./entity-extractor/pattern.adapter.js";

// Consensus
export { LlmJudgeConsensus } from "./consensus/llm-judge.adapter.js";
export { MajorityVoteConsensus } from "./consensus/majority-vote.adapter.js";
export { DebateConsensus } from "./consensus/debate.adapter.js";

// Graph Visualization
export { AsciiGraphAdapter } from "./graph-visualization/ascii-graph.adapter.js";
export { MermaidGraphAdapter } from "./graph-visualization/mermaid-graph.adapter.js";

// Voice
export { OpenAIVoiceAdapter } from "./voice/openai/openai-voice.adapter.js";
export type { OpenAIVoiceOptions } from "./voice/openai/openai-voice.adapter.js";
export { ElevenLabsVoiceAdapter } from "./voice/elevenlabs/elevenlabs-voice.adapter.js";
export type { ElevenLabsVoiceOptions } from "./voice/elevenlabs/elevenlabs-voice.adapter.js";
export { VoicePipeline } from "./voice/voice-pipeline.js";
export type { VoicePipelineConfig, VoicePipelineResult } from "./voice/voice-pipeline.js";
export { InMemoryVoiceAdapter } from "./voice/inmemory.adapter.js";

// Datasets & Deployer
export { InMemoryDatasetsAdapter } from "./datasets/inmemory.adapter.js";
export { InMemoryDeployerAdapter } from "./deployer/inmemory.adapter.js";

// Agent Debugger
export { DebugSessionImpl, InMemoryAgentDebuggerAdapter, DebugMiddleware } from "./agent-debugger/index.js";

// Agent Orchestrator
export {
  AgentOrchestratorAdapter,
  createSupervisorOrchestration,
  createSwarmOrchestration,
  createPipelineOrchestration,
  createMapReduceOrchestration,
  createDebateOrchestration,
} from "./agent-orchestrator/index.js";

// Structured Output
export {
  StructuredOutputAdapter,
  JsonStreamParser,
  repairJson,
  parseJson,
  parseYaml,
  parseCsv,
  parseMarkdownTable,
} from "./structured-output/index.js";

// Guardrails
export {
  GuardrailsAdapter,
  PiiDetector,
  InjectionDetector,
  ContentModerator,
  TokenBudget as GuardrailTokenBudget,
  SchemaValidator,
} from "./guardrails/index.js";

// Observability Pipeline
export {
  ObservabilityPipelineAdapter,
  TraceImpl,
  SpanImpl,
  MetricsCollector,
  ConsoleExporter,
  JsonExporter,
} from "./observability-pipeline/index.js";

// Rate Limiter
export { InMemoryRateLimiter } from "./rate-limiter/index.js";
