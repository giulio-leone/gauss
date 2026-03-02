/**
 * Gauss SDK — Thin TypeScript wrappers over Rust core (via NAPI).
 *
 * Quick start:
 *   import { gauss } from "gauss-ts";
 *   const answer = await gauss("What is the meaning of life?");
 *
 * Full control:
 *   import { Agent, Graph, Memory, Network } from "gauss-ts";
 *
 * All orchestration (agent loop, tool execution, middleware, plugins,
 * graph/workflow execution) is handled by the Rust core.
 */

// ─── Quick Start ───────────────────────────────────────────────────
// gauss() is re-exported via the Core Agent section below

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
  CostEstimate,
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

// ─── Model Constants ───────────────────────────────────────────────
export {
  OPENAI_DEFAULT,
  OPENAI_FAST,
  OPENAI_REASONING,
  OPENAI_IMAGE,
  ANTHROPIC_DEFAULT,
  ANTHROPIC_FAST,
  ANTHROPIC_PREMIUM,
  GOOGLE_DEFAULT,
  GOOGLE_PREMIUM,
  GOOGLE_IMAGE,
  OPENROUTER_DEFAULT,
  TOGETHER_DEFAULT,
  FIREWORKS_DEFAULT,
  MISTRAL_DEFAULT,
  PERPLEXITY_DEFAULT,
  XAI_DEFAULT,
  DEEPSEEK_DEFAULT,
  DEEPSEEK_REASONING,
  PROVIDER_DEFAULTS,
  defaultModel,
} from "./models.js";

// ─── Core Agent ────────────────────────────────────────────────────
export { Agent, gauss } from "./agent.js";
export type { AgentConfig } from "./agent.js";
export { enterprisePreset, enterpriseRun } from "./enterprise.js";
export type { EnterprisePresetOptions } from "./enterprise.js";

// ─── Streaming ────────────────────────────────────────────────────
export { AgentStream } from "./stream-iter.js";
export type { StreamEvent } from "./stream-iter.js";

// ─── Batch ────────────────────────────────────────────────────────
export { batch } from "./batch.js";
export type { BatchItem } from "./batch.js";

// ─── Code Execution & Image Generation ─────────────────────────────
export { executeCode, availableRuntimes, generateImage, version } from "./code-execution.js";

// ─── Memory ────────────────────────────────────────────────────────
export { Memory } from "./memory.js";

// ─── RAG / Vector Store ────────────────────────────────────────────
export { VectorStore } from "./vector-store.js";
export { TextSplitter, splitText } from "./text-splitter.js";
export type { TextSplitterOptions, TextChunk } from "./text-splitter.js";
export { loadText, loadMarkdown, loadJson } from "./document-loader.js";
export type { DocumentLoaderOptions, LoadedDocument } from "./document-loader.js";

// ─── Graph & Workflow ──────────────────────────────────────────────
export { Graph } from "./graph.js";
export type { GraphNodeConfig, ForkNodeConfig, ConsensusStrategy, RouterFn } from "./graph.js";
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

// ─── Typed Tools ──────────────────────────────────────────────────
export { tool, isTypedTool, createToolExecutor } from "./tool.js";
export type { TypedToolDef } from "./tool.js";

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

// ─── MCP Client ───────────────────────────────────────────────────
export { McpClient } from "./mcp-client.js";
export type { McpClientConfig, McpToolDef, McpToolResult } from "./mcp-client.js";

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
  estimateCost,
  setPricing,
  getPricing,
  clearPricing,
  type ModelPricing,
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
