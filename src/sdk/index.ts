/**
 * Gauss SDK — Thin TypeScript wrappers over Rust core (via NAPI).
 *
 * Quick start:
 *   import { gauss } from "gauss-ai";
 *   const answer = await gauss("What is the meaning of life?");
 *
 * Full control:
 *   import { Agent, Graph, Memory, Network } from "gauss-ai";
 *
 * All orchestration (agent loop, tool execution, middleware, plugins,
 * graph/workflow execution) is handled by the Rust core.
 */

// ─── Quick Start ───────────────────────────────────────────────────
export { gauss } from "./agent.js";

// ─── Types ─────────────────────────────────────────────────────────
export type {
  ProviderOptions,
  ProviderType,
  ToolDef,
  MessageRole,
  Message,
  JsMessage,
  AgentOptions,
  AgentResult,
  Citation,
  GroundingMetadata,
  GroundingChunk,
  ImageGenerationConfig,
  ImageGenerationResult,
  GeneratedImageData,
  ProviderCapabilities,
  CodeExecutionOptions,
  CodeExecutionResult,
  ToolExecutor,
  StreamCallback,
  MemoryEntry,
  RecallOptions,
  MemoryStats,
  VectorChunk,
  SearchResult,
  PiiAction,
  CoercionStrategy,
  EvalScorerType,
  Handle,
  Disposable,
} from "./types.js";

export { resolveApiKey, detectProvider } from "./types.js";

// ─── Core Agent ────────────────────────────────────────────────────
export { Agent, AgentStream, batch } from "./agent.js";
export type { AgentConfig, StreamEvent, BatchItem } from "./agent.js";

// ─── Memory ────────────────────────────────────────────────────────
export { Memory } from "./memory.js";

// ─── RAG / Vector Store ────────────────────────────────────────────
export { VectorStore } from "./vector-store.js";

// ─── Graph & Workflow ──────────────────────────────────────────────
export { Graph } from "./graph.js";
export type { GraphNodeConfig, ForkNodeConfig, ConsensusStrategy } from "./graph.js";
export { Workflow } from "./workflow.js";
export type { WorkflowStepConfig } from "./workflow.js";

// ─── Team ──────────────────────────────────────────────────────────
export { Team } from "./team.js";
export type { TeamStrategy, TeamResult } from "./team.js";

// ─── Network (Multi-Agent) ─────────────────────────────────────────
export { Network } from "./network.js";

// ─── Middleware ────────────────────────────────────────────────────
export { MiddlewareChain } from "./middleware.js";

// ─── Plugin System ─────────────────────────────────────────────────
export { PluginRegistry } from "./plugin.js";

// ─── MCP ───────────────────────────────────────────────────────────
export {
  McpServer,
  type McpResource,
  type McpPrompt,
  type McpPromptArgument,
  type McpPromptMessage,
  type McpContent,
  type McpResourceContent,
  type McpPromptResult,
  type McpModelHint,
  type McpModelPreferences,
  type McpSamplingMessage,
  type McpSamplingRequest,
  type McpSamplingResponse,
} from "./mcp.js";

// ─── Guardrails ────────────────────────────────────────────────────
export { GuardrailChain } from "./guardrail.js";

// ─── HITL ──────────────────────────────────────────────────────────
export { ApprovalManager } from "./approval.js";
export { CheckpointStore } from "./checkpoint.js";

// ─── Eval ──────────────────────────────────────────────────────────
export { EvalRunner } from "./eval.js";

// ─── Telemetry ─────────────────────────────────────────────────────
export { Telemetry } from "./telemetry.js";

// ─── Resilience ────────────────────────────────────────────────────
export {
  createFallbackProvider,
  createCircuitBreaker,
  createResilientProvider,
  createResilientAgent,
} from "./resilience.js";

// ─── Tokens ────────────────────────────────────────────────────────
export {
  countTokens,
  countTokensForModel,
  countMessageTokens,
  getContextWindowSize,
} from "./tokens.js";

// ─── Config ────────────────────────────────────────────────────────
export { parseAgentConfig, resolveEnv } from "./config.js";

// ─── Tool Validator ────────────────────────────────────────────────
export { ToolValidator } from "./tool-validator.js";

// ─── Stream Utils ──────────────────────────────────────────────────
export { parsePartialJson } from "./stream.js";

// ─── Retry ─────────────────────────────────────────────────────────
export { withRetry, retryable } from "./retry.js";
export type { RetryConfig } from "./retry.js";

// ─── Structured Output ────────────────────────────────────────────
export { structured } from "./structured.js";
export type { JsonSchema, StructuredConfig, StructuredResult } from "./structured.js";

// ─── Prompt Templates ─────────────────────────────────────────────
export {
  template,
  summarize,
  translate,
  codeReview,
  classify,
  extract,
} from "./template.js";
export type { PromptTemplate } from "./template.js";

// ─── AGENTS.MD & SKILL.MD Parsers ────────────────────────────────
export { AgentSpec, SkillSpec, discoverAgents } from "./spec.js";
export type {
  AgentSpecData,
  AgentToolSpec,
  SkillSpecData,
  SkillStep,
  SkillParam,
} from "./spec.js";

// ─── Pipeline & Async Helpers ─────────────────────────────────────
export {
  pipe,
  mapAsync,
  filterAsync,
  reduceAsync,
  tapAsync,
  compose,
} from "./pipeline.js";
export type { PipeStep } from "./pipeline.js";
export {
  A2aClient,
  textMessage,
  userMessage,
  agentMessage,
  extractText,
  taskText,
} from "./a2a.js";
export type {
  A2aClientOptions,
  A2aMessage,
  A2aMessageRole,
  AgentCard,
  AgentCapabilities,
  AgentSkill,
  Artifact,
  MessageSendConfig,
  Part,
  SendMessageResult,
  Task,
  TaskState,
  TaskStatus,
} from "./a2a.js";
export {
  ToolRegistry,
  type ToolExample,
  type ToolRegistryEntry,
  type ToolSearchResult,
} from "./tool-registry.js";
