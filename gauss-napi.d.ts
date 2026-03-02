/* tslint:disable */
/* eslint-disable */
/* auto-generated – DO NOT EDIT */

// ============ Shared Types ============

export interface ProviderOptions {
  apiKey: string
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  organization?: string
}

export interface ToolDef {
  name: string
  description: string
  parameters?: Record<string, unknown>
}

export interface JsMessage {
  role: string
  content: string
}

export interface AgentOptions {
  instructions?: string
  maxSteps?: number
  temperature?: number
  topP?: number
  maxTokens?: number
  seed?: number
  stopOnTool?: string
  outputSchema?: Record<string, unknown>
  thinkingBudget?: number
  cacheControl?: boolean
  codeExecution?: {
    python?: boolean
    javascript?: boolean
    bash?: boolean
    timeoutSecs?: number
    workingDir?: string
    sandbox?: string
    unified?: boolean
  }
  /** Enable Google Search grounding (Gemini only). */
  grounding?: boolean
  /** Enable native code execution / Gemini code interpreter. */
  nativeCodeExecution?: boolean
  /** Response modalities (e.g. ["TEXT", "IMAGE"] for Gemini image generation). */
  responseModalities?: string[]
}

export interface AgentResult {
  text: string
  steps: number
  inputTokens: number
  outputTokens: number
  structuredOutput?: Record<string, unknown>
  thinking?: string
  citations?: Array<{
    citationType: string
    citedText?: string
    documentTitle?: string
    start?: number
    end?: number
  }>
  groundingMetadata?: Record<string, unknown>
}

// ============ NAPI Response Types ============

export interface GenerateResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  thinking?: string;
  finishReason?: string;
}

export interface GenerateWithToolsResponse {
  text?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
}

export interface NapiProviderCapabilities {
  streaming: boolean;
  tool_use: boolean;
  vision: boolean;
  audio: boolean;
  extended_thinking: boolean;
  citations: boolean;
  cache_control: boolean;
  structured_output: boolean;
  reasoning_effort: boolean;
  image_generation: boolean;
  grounding: boolean;
  code_execution: boolean;
  web_search: boolean;
}

export interface NapiCostEstimate {
  model: string;
  normalized_model: string;
  currency: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  input_cost_usd: number;
  output_cost_usd: number;
  reasoning_cost_usd: number;
  cache_read_cost_usd: number;
  cache_creation_cost_usd: number;
  total_cost_usd: number;
}

export interface NapiCodeExecutionResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
  runtime: string;
  success: boolean;
}

export interface NapiMemoryEntry {
  id: string;
  content: string;
  entry_type: string;
  timestamp: string;
  tier?: string;
  metadata?: Record<string, unknown>;
  importance?: number;
  session_id?: string;
  embedding?: number[];
}

export interface NapiMemoryStats {
  total_entries: number;
  [key: string]: unknown;
}

export interface NapiSearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface NapiImageGenerationResult {
  images: Array<{
    url?: string;
    base64?: string;
    mime_type?: string;
  }>;
  revised_prompt?: string;
}

export interface NapiGraphRunResult {
  [nodeId: string]: string | Record<string, unknown>;
}

export interface NapiWorkflowRunResult {
  [stepId: string]: string | Record<string, unknown>;
}

export interface NapiTeamRunResult {
  text: string;
  agent?: string;
  strategy?: string;
  results?: Array<{ agent: string; text: string }>;
}

export interface NapiNetworkDelegateResult {
  text: string;
  from_agent: string;
  to_agent: string;
}

export interface NapiAgentCard {
  name: string;
  instructions?: string;
  [key: string]: unknown;
}

export interface NapiCheckpointData {
  id: string;
  session_id: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface NapiEvalDataset {
  items: Array<{
    input: string;
    expected?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface NapiTelemetrySpan {
  trace_id: string;
  span_id: string;
  name: string;
  start_time: string;
  end_time?: string;
  attributes?: Record<string, unknown>;
}

export interface NapiTelemetryMetrics {
  spans_count: number;
  [key: string]: unknown;
}

export interface NapiMcpResponse {
  jsonrpc: string;
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

export interface NapiApprovalRequest {
  id: string;
  tool_name: string;
  args: string;
  session_id: string;
  status: string;
}

export interface NapiAgentsMdParsed {
  agents: Array<{
    name: string;
    instructions?: string;
    tools?: string[];
    [key: string]: unknown;
  }>;
}

export interface NapiSkillMdParsed {
  name: string;
  description?: string;
  steps?: string[];
  [key: string]: unknown;
}

export interface NapiToolRegistryEntry {
  name: string;
  description: string;
  tags?: string[];
  parameters?: Record<string, unknown>;
}

export interface NapiA2aTaskResult {
  id: string;
  status: string;
  [key: string]: unknown;
}

// ============ Version ============

export function version(): string

// ============ Provider ============

export function create_provider(providerType: string, model: string, options: ProviderOptions): number
export function destroy_provider(handle: number): void

// ============ Agent ============

export function agent_run(
  name: string,
  providerHandle: number,
  tools: ToolDef[],
  messages: JsMessage[],
  options?: AgentOptions | undefined | null
): Promise<AgentResult>

export function agent_run_with_tool_executor(
  name: string,
  providerHandle: number,
  tools: ToolDef[],
  messages: JsMessage[],
  options?: AgentOptions | undefined | null,
  toolExecutor?: (callJson: string) => Promise<string>
): Promise<AgentResult>

export function agent_stream_with_tool_executor(
  name: string,
  providerHandle: number,
  tools: ToolDef[],
  messages: JsMessage[],
  options?: AgentOptions | undefined | null,
  streamCallback?: (eventJson: string) => void,
  toolExecutor?: (callJson: string) => Promise<string>
): Promise<AgentResult>

// ============ Generate (raw provider call) ============

export function generate(
  providerHandle: number,
  messages: JsMessage[],
  temperature?: number | undefined | null,
  maxTokens?: number | undefined | null,
  thinkingBudget?: number | undefined | null,
  cacheControl?: boolean | undefined | null
): Promise<GenerateResponse>

export function generate_with_tools(
  providerHandle: number,
  messages: JsMessage[],
  tools: ToolDef[],
  temperature?: number | undefined | null,
  maxTokens?: number | undefined | null
): Promise<GenerateWithToolsResponse>

// ============ Provider Capabilities ============

export function get_provider_capabilities(providerHandle: number): NapiProviderCapabilities
export function estimate_cost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  reasoningTokens?: number | undefined | null,
  cacheReadTokens?: number | undefined | null,
  cacheCreationTokens?: number | undefined | null
): NapiCostEstimate

// ============ Code Execution (PTC) ============

export function execute_code(
  language: string,
  code: string,
  timeoutSecs?: number | undefined | null,
  workingDir?: string | undefined | null,
  sandbox?: string | undefined | null
): Promise<NapiCodeExecutionResult>

export function available_runtimes(): Promise<string[]>

// ============ Image Generation ============

export function generate_image(
  providerHandle: number,
  prompt: string,
  model?: string | undefined | null,
  size?: string | undefined | null,
  quality?: string | undefined | null,
  style?: string | undefined | null,
  aspectRatio?: string | undefined | null,
  n?: number | undefined | null,
  responseFormat?: string | undefined | null
): Promise<NapiImageGenerationResult>

// ============ Memory ============

export function create_memory(): number
export function memory_store(handle: number, entryJson: string): Promise<void>
export function memory_recall(handle: number, optionsJson?: string | undefined | null): Promise<NapiMemoryEntry[]>
export function memory_clear(handle: number, sessionId?: string | undefined | null): Promise<void>
export function memory_stats(handle: number): Promise<NapiMemoryStats>
export function destroy_memory(handle: number): void

// ============ Context / Tokens ============

export function count_tokens(text: string): number
export function count_tokens_for_model(text: string, model: string): number
export function count_message_tokens(messages: JsMessage[]): number
export function get_context_window_size(model: string): number

// ============ RAG / Vector Store ============

export function create_vector_store(): number
export function vector_store_upsert(handle: number, chunksJson: string): Promise<void>
export function vector_store_search(handle: number, embeddingJson: string, topK: number): Promise<NapiSearchResult[]>
export function destroy_vector_store(handle: number): void
export function cosine_similarity(a: number[], b: number[]): number

// ============ MCP ============

export function create_mcp_server(name: string, versionStr: string): number
export function mcp_server_add_tool(handle: number, toolJson: string): void
export function mcpServerAddResource(handle: number, resourceJson: string): void
export function mcpServerAddPrompt(handle: number, promptJson: string): void
export function mcp_server_handle(handle: number, messageJson: string): Promise<NapiMcpResponse>
export function destroy_mcp_server(handle: number): void

// ============ Network (Multi-Agent) ============

export function create_network(): number
export function network_add_agent(
  handle: number,
  name: string,
  providerHandle: number,
  instructions?: string | undefined | null
): void
export function network_set_supervisor(handle: number, agentName: string): void
export function network_delegate(
  handle: number,
  fromAgent: string,
  toAgent: string,
  prompt: string
): Promise<NapiNetworkDelegateResult>
export function network_agent_cards(handle: number): NapiAgentCard[]
export function destroy_network(handle: number): void

// ============ Middleware ============

export function create_middleware_chain(): number
export function middleware_use_logging(handle: number): void
export function middleware_use_caching(handle: number, ttlMs: number): void
export function middleware_use_rate_limit(
  handle: number,
  requestsPerMinute: number,
  burst?: number | undefined | null
): void
export function destroy_middleware_chain(handle: number): void

// ============ HITL — Approval ============

export function create_approval_manager(): number
export function approval_request(
  handle: number,
  toolName: string,
  argsJson: string,
  sessionId: string
): string
export function approval_approve(
  handle: number,
  requestId: string,
  modifiedArgs?: string | undefined | null
): void
export function approval_deny(
  handle: number,
  requestId: string,
  reason?: string | undefined | null
): void
export function approval_list_pending(handle: number): NapiApprovalRequest[]
export function destroy_approval_manager(handle: number): void

// ============ HITL — Checkpoints ============

export function create_checkpoint_store(): number
export function checkpoint_save(handle: number, checkpointJson: string): Promise<void>
export function checkpoint_load(handle: number, checkpointId: string): Promise<NapiCheckpointData | null>
export function checkpoint_load_latest(handle: number, sessionId: string): Promise<NapiCheckpointData | null>
export function destroy_checkpoint_store(handle: number): void

// ============ Eval ============

export function create_eval_runner(threshold?: number | undefined | null): number
export function eval_add_scorer(handle: number, scorerType: string): void
export function load_dataset_jsonl(jsonl: string): NapiEvalDataset
export function load_dataset_json(jsonStr: string): NapiEvalDataset
export function destroy_eval_runner(handle: number): void

// ============ Telemetry ============

export function create_telemetry(): number
export function telemetry_record_span(handle: number, spanJson: string): void
export function telemetry_export_spans(handle: number): NapiTelemetrySpan[]
export function telemetry_export_metrics(handle: number): NapiTelemetryMetrics
export function telemetry_clear(handle: number): void
export function destroy_telemetry(handle: number): void

// ============ Guardrails ============

export function create_guardrail_chain(): number
export function guardrail_chain_add_content_moderation(
  handle: number,
  blockPatterns: string[],
  warnPatterns: string[]
): void
export function guardrail_chain_add_pii_detection(handle: number, action: string): void
export function guardrail_chain_add_token_limit(
  handle: number,
  maxInput?: number | undefined | null,
  maxOutput?: number | undefined | null
): void
export function guardrail_chain_add_regex_filter(
  handle: number,
  blockRules: string[],
  warnRules: string[]
): void
export function guardrail_chain_add_schema(handle: number, schemaJson: string): void
export function guardrail_chain_list(handle: number): string[]
export function destroy_guardrail_chain(handle: number): void

// ============ Resilience ============

export function create_fallback_provider(providerHandles: number[]): number
export function create_circuit_breaker(
  providerHandle: number,
  failureThreshold?: number | undefined | null,
  recoveryTimeoutMs?: number | undefined | null
): number
export function create_resilient_provider(
  primaryHandle: number,
  fallbackHandles: number[],
  enableCircuitBreaker?: boolean | undefined | null
): number

// ============ Plugin System ============

export function create_plugin_registry(): number
export function plugin_registry_add_telemetry(handle: number): void
export function plugin_registry_add_memory(handle: number): void
export function plugin_registry_list(handle: number): string[]
export function plugin_registry_emit(handle: number, eventJson: string): void
export function destroy_plugin_registry(handle: number): void

// ============ Tool Validator ============

export function create_tool_validator(strategies?: string[] | undefined | null): number
export function tool_validator_validate(handle: number, input: string, schema: string): string
export function destroy_tool_validator(handle: number): void

// ============ Config ============

export function agent_config_from_json(jsonStr: string): string
export function agent_config_resolve_env(value: string): string

// ============ Graph ============

export function create_graph(): number
export function graph_add_node(
  handle: number,
  nodeId: string,
  agentName: string,
  providerHandle: number,
  instructions?: string | undefined | null,
  tools?: ToolDef[]
): void
export function graph_add_edge(handle: number, from: string, to: string): void
export interface ForkAgentDef {
  agentName: string
  providerHandle: number
  instructions?: string | undefined | null
}
export function graph_add_fork_node(
  handle: number,
  nodeId: string,
  agents: ForkAgentDef[],
  consensus: string
): void
export function graph_run(handle: number, prompt: string): Promise<NapiGraphRunResult>
export function destroy_graph(handle: number): void

// ============ Workflow ============

export function create_workflow(): number
export function workflow_add_step(
  handle: number,
  stepId: string,
  agentName: string,
  providerHandle: number,
  instructions?: string | undefined | null,
  tools?: ToolDef[]
): void
export function workflow_add_dependency(handle: number, stepId: string, dependsOn: string): void
export function workflow_run(handle: number, prompt: string): Promise<NapiWorkflowRunResult>
export function destroy_workflow(handle: number): void

// ============ Stream Utils ============

export function parse_partial_json(text: string): string | null

// ============ Team ============

export function create_team(name: string): number
export function team_add_agent(
  handle: number,
  agentName: string,
  providerHandle: number,
  instructions?: string | undefined | null
): void
export function team_set_strategy(handle: number, strategy: string): void
export function team_run(handle: number, messagesJson: string): Promise<NapiTeamRunResult>
export function destroy_team(handle: number): void

// ============ AGENTS.MD & SKILL.MD Parsers ============

export function parseAgentsMd(content: string): NapiAgentsMdParsed
export function discoverAgents(dir: string): NapiAgentsMdParsed
export function parseSkillMd(content: string): NapiSkillMdParsed

// ============ A2A Protocol ============

export function createA2aClient(baseUrl: string, authToken?: string): { baseUrl: string; authToken?: string }
export function a2aDiscover(baseUrl: string, authToken?: string): Promise<NapiAgentCard>
export function a2aSendMessage(baseUrl: string, authToken?: string | null, messageJson: string, configJson?: string | null): Promise<NapiA2aTaskResult>
export function a2aAsk(baseUrl: string, authToken?: string | null, text: string): Promise<string>
export function a2aGetTask(baseUrl: string, authToken?: string | null, taskId: string, historyLength?: number | null): Promise<NapiA2aTaskResult>
export function a2aCancelTask(baseUrl: string, authToken?: string | null, taskId: string): Promise<NapiA2aTaskResult>
export function a2aHandleRequest(agentCardJson: string, requestBody: string): Promise<string>

// ============ Tool Registry ============

export function createToolRegistry(): number
export function toolRegistryAdd(handle: number, toolJson: string): void
export function toolRegistrySearch(handle: number, query: string): NapiToolRegistryEntry[]
export function toolRegistryByTag(handle: number, tag: string): NapiToolRegistryEntry[]
export function toolRegistryList(handle: number): NapiToolRegistryEntry[]
export function destroyToolRegistry(handle: number): void
