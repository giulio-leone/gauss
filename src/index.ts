// =============================================================================
// @onegenui/deep-agents — Public API
// =============================================================================

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

// ─────────────────────────────────────────────────────────────────────────────
// Ports (contracts for hexagonal architecture)
// ─────────────────────────────────────────────────────────────────────────────

export type { MemoryPort } from "./ports/memory.port.js";
export type { FilesystemPort } from "./ports/filesystem.port.js";
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

// ─────────────────────────────────────────────────────────────────────────────
// Agent — Approval & Events
// ─────────────────────────────────────────────────────────────────────────────

export { ApprovalManager } from "./agent/approval-manager.js";
export { EventBus } from "./agent/event-bus.js";

// ─────────────────────────────────────────────────────────────────────────────
// Plugins
// ─────────────────────────────────────────────────────────────────────────────

export type { DeepAgentPlugin, PluginHooks, PluginContext } from "./ports/plugin.port.js";
export { PluginManager } from "./plugins/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Filesystem (runtime-agnostic)
// ─────────────────────────────────────────────────────────────────────────────

export { VirtualFilesystem, type DiskSyncFn } from "./adapters/filesystem/virtual-fs.adapter.js";
// Node.js-specific: LocalFilesystem → import from "@onegenui/deep-agents/node"

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — MCP
// ─────────────────────────────────────────────────────────────────────────────

export { OnegenUiMcpAdapter } from "./adapters/mcp/onegenui-mcp.adapter.js";
export { AiSdkMcpAdapter } from "./adapters/mcp/ai-sdk-mcp.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — Memory
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryAdapter } from "./adapters/memory/in-memory.adapter.js";
export { SupabaseMemoryAdapter } from "./adapters/memory/supabase.adapter.js";

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
// Node.js-specific: TiktokenTokenCounter → import from "@onegenui/deep-agents/node"

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
export type { GraphConfig, GraphResult } from "./domain/graph.schema.js";

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
