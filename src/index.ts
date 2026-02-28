// =============================================================================
// gauss — Public API
// =============================================================================
// This barrel exports the core public surface only.
// Domain-specific exports are available via sub-entry points:
//   gauss-ai/graph    — Multi-agent graphs, teams, supervisors, consensus
//   gauss-ai/memory   — Memory adapters & ports
//   gauss-ai/rag      — RAG pipelines & knowledge
//   gauss-ai/tools    — Filesystem, subagent, planning, policy tools
//   gauss-ai/evals    — Evaluation harness, scorers, trajectory
//   gauss-ai/adapters — All adapters (power-user deep imports)
//   gauss-ai/schemas  — Domain schemas (todo, plan, workflow, compiler, etc.)
// =============================================================================

// ─── Factory Functions ───────────────────────────────────────────────────────

export { agent, graph, rag, memory } from "./gauss.js";

// ─── Agent (core class) ─────────────────────────────────────────────────────

export { Agent } from "./agent/agent.js";
export { AgentBuilder } from "./agent/agent-builder.js";
export type { AgentResult, AgentRunOptions } from "./agent/agent.js";

// ─── Agent Primitive (core API) ─────────────────────────────────────────────

export { Agent as AgentPrimitive } from "./core/agent/index.js";
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

export { Output, generateText, streamText, tool, stepCountIs, hasToolCall } from "./core/llm/index.js";
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
  Message,
  CompressedContext,
  SessionState,
} from "./types.js";

// ─── Plugin System ──────────────────────────────────────────────────────────

export type {
  Plugin,
  PluginHooks,
  PluginContext,
  PluginSetupContext,
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
  PluginRunMetadata,
} from "./ports/plugin.port.js";
export { PluginManager, BasePlugin } from "./plugins/index.js";
export { MemoryPlugin, createMemoryPlugin } from "./plugins/memory.plugin.js";
export type { MemoryPluginOptions } from "./plugins/memory.plugin.js";

// ─── Key Ports (type-only, for custom adapter implementations) ──────────────

export type { RuntimePort } from "./ports/runtime.port.js";
export type { MemoryPort } from "./ports/memory.port.js";
export type { TokenCounterPort, TokenBudget, TokenUsage } from "./ports/token-counter.port.js";
export type { TelemetryPort, TelemetrySpan } from "./ports/telemetry.port.js";
export type { LoggingPort, LogLevel, LogEntry } from "./ports/logging.port.js";
export type { McpPort, McpToolDefinition, McpToolResult, McpServerInfo, McpServerConfig } from "./ports/mcp.port.js";
export type { VoicePort, VoiceConfig, VoiceEvent } from "./ports/voice.port.js";
export type { MiddlewarePort, MiddlewareContext } from "./ports/middleware.port.js";

// ─── Graph (top-level only, details in gauss-ai/graph) ─────────────────────

export { AgentGraph } from "./graph/agent-graph.js";
export { Team, team } from "./graph/team-builder.js";
export type { CoordinationStrategy, TeamResult } from "./graph/team-builder.js";

// ─── RAG (top-level only, details in gauss-ai/rag) ─────────────────────────

export { RAGPipeline } from "./rag/pipeline.js";

// ─── Middleware (commonly used factories) ───────────────────────────────────

export { MiddlewareChain, composeMiddleware } from "./middleware/chain.js";

// ─── Streaming (commonly used) ──────────────────────────────────────────────

export { createEventStream } from "./streaming/event-stream.js";
export { createSseHandler } from "./streaming/sse-handler.js";
export type { EventStreamOptions } from "./streaming/event-stream.js";

// ─── REST Server ────────────────────────────────────────────────────────────

export { GaussServer } from "./rest/server.js";
export type {
  ServerOptions as RestServerOptions,
  RunRequest,
  RunResponse,
  StreamEvent,
  ErrorResponse,
} from "./rest/types.js";

// ─── Multimodal ─────────────────────────────────────────────────────────────

export { multimodal } from "./domain/multimodal.js";
export type { ImageInput, MultimodalMessage, MultimodalResult } from "./domain/multimodal.js";

// ─── Video ──────────────────────────────────────────────────────────────────

export { videoProcessor } from "./domain/video-processor.js";
export type { VideoInput, VideoFrame, VideoAnalysisResult } from "./domain/video-processor.js";

// ─── Workflow ───────────────────────────────────────────────────────────────

export { workflow, WorkflowDSL } from "./domain/workflow-dsl.js";
export type { StepDefinition, BranchDefinition, ConvergeDefinition } from "./domain/workflow-dsl.js";

// ─── Runtime Detection ──────────────────────────────────────────────────────

export { detectRuntime, detectCapabilities } from "./runtime/detect.js";
export type { RuntimeId, RuntimeCapabilities } from "./runtime/detect.js";

// ─── Playground ─────────────────────────────────────────────────────────────

export { startPlayground } from "./cli/playground.js";

// ─── Utils ──────────────────────────────────────────────────────────────────

export { AbstractBuilder } from "./utils/abstract-builder.js";
