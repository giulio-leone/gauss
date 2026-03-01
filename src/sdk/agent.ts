/**
 * Agent — the heart of Gauss.
 *
 * Quick start:
 *   const agent = new Agent({ instructions: "You are a helpful assistant." });
 *   const result = await agent.run("What is the meaning of life?");
 *
 * Full control:
 *   const agent = new Agent({
 *     name: "researcher",
 *     provider: "anthropic",
 *     model: "claude-sonnet-4-20250514",
 *     providerOptions: { apiKey: "sk-..." },
 *     instructions: "You are a research assistant.",
 *     tools: [{ name: "search", description: "Search the web", parameters: { query: { type: "string" } } }],
 *     temperature: 0.7,
 *     maxSteps: 10,
 *   });
 */
import {
  create_provider,
  destroy_provider,
  agent_run,
  agent_run_with_tool_executor,
  agent_stream_with_tool_executor,
  generate,
  generate_with_tools,
  get_provider_capabilities,
} from "gauss-napi";

import type {
  ProviderOptions,
  ProviderType,
  ToolDef,
  Message,
  AgentOptions,
  AgentResult,
  ToolExecutor,
  StreamCallback,
  Handle,
  Disposable,
} from "./types.js";

import { resolveApiKey, detectProvider } from "./types.js";
import { OPENAI_DEFAULT } from "./models.js";
import { AgentStream } from "./stream-iter.js";

/**
 * Transform a raw NAPI result into the public {@link AgentResult} shape.
 *
 * @description Normalises citation field names returned by different native providers
 * into the unified SDK format.
 *
 * @param raw - Raw result object from the NAPI layer.
 * @returns Normalised {@link AgentResult}.
 * @internal
 */
function toSdkResult(raw: any): AgentResult {
  return {
    ...raw,
    citations: raw.citations?.map((c: any) => ({
      type: c.citationType ?? c.type,
      citedText: c.citedText,
      documentTitle: c.documentTitle,
      start: c.start,
      end: c.end,
    })),
  };
}

// ─── Config ────────────────────────────────────────────────────────

/**
 * Configuration object for creating an {@link Agent} instance.
 *
 * @description All fields are optional — sensible defaults are applied and the provider is auto-detected from environment variables when omitted.
 *
 * @example
 * ```ts
 * const config: AgentConfig = {
 *   provider: "anthropic",
 *   model: "claude-sonnet-4-20250514",
 *   instructions: "You are a helpful assistant.",
 *   temperature: 0.7,
 * };
 * const agent = new Agent(config);
 * ```
 *
 * @since 1.0.0
 */
export interface AgentConfig {
  /** Agent name (default: `"agent"`). Used for logging and identification. */
  name?: string;

  /** LLM provider. Auto-detected from env if omitted. */
  provider?: ProviderType;

  /** Model identifier (e.g. `"gpt-4o"`, `"claude-sonnet-4-20250514"`). Auto-selected if omitted. */
  model?: string;

  /** Provider connection options. API key auto-resolved from env if omitted. */
  providerOptions?: ProviderOptions;

  /** System instructions prepended to every conversation. */
  instructions?: string;

  /** Tool definitions available to the agent. */
  tools?: ToolDef[];

  /** Sampling temperature (0–2). Higher values produce more creative output. */
  temperature?: number;

  /** Maximum number of agentic loop iterations before stopping. */
  maxSteps?: number;

  /** Top-p (nucleus) sampling threshold. */
  topP?: number;

  /** Maximum number of output tokens per response. */
  maxTokens?: number;

  /** Deterministic seed for reproducible outputs. */
  seed?: number;

  /** Stop the agentic loop when this tool name is called. */
  stopOnTool?: string;

  /** JSON schema for structured output. The model will conform its response to this schema. */
  outputSchema?: Record<string, unknown>;

  /** Extended thinking budget (Anthropic). Number of tokens for internal reasoning. */
  thinkingBudget?: number;

  /** Reasoning effort for OpenAI o-series models. Controls how much reasoning to use. */
  reasoningEffort?: "low" | "medium" | "high";

  /** Enable prompt caching (Anthropic). Auto-annotates system messages and tools. */
  cacheControl?: boolean;

  /** Enable code execution runtimes. Pass `true` for all defaults, or configure individually. */
  codeExecution?: boolean | import("./types.js").CodeExecutionOptions;

  /** Enable Google Search grounding (Gemini only). */
  grounding?: boolean;

  /** Enable native code execution / Gemini code interpreter. */
  nativeCodeExecution?: boolean;

  /** Response modalities (e.g. `["TEXT", "IMAGE"]` for Gemini image generation). */
  responseModalities?: string[];
}

// ─── Agent Class ───────────────────────────────────────────────────

/**
 * Core agent class that wraps a native LLM provider and manages the agentic loop.
 *
 * @description `Agent` is the primary entry-point for interacting with language models in Gauss.
 * It supports single-shot completions, multi-step tool-use loops, streaming, and raw generation.
 * Each instance owns a native provider handle that **must** be released via {@link Agent.destroy}
 * (or the `using` pattern) to avoid resource leaks.
 *
 * @example
 * ```ts
 * const agent = new Agent({
 *   provider: "openai",
 *   model: "gpt-4o",
 *   instructions: "You are a helpful assistant.",
 * });
 * const result = await agent.run("What is the meaning of life?");
 * console.log(result.text);
 * agent.destroy();
 * ```
 *
 * @since 1.0.0
 */
export class Agent implements Disposable {
  private readonly providerHandle: Handle;
  private readonly _name: string;
  private readonly _provider: ProviderType;
  private readonly _model: string;
  private readonly _instructions: string;
  private _tools: ToolDef[] = [];
  private _options: AgentOptions = {};
  private disposed = false;

  /**
   * Create a new Agent.
   *
   * @description Initialises the native provider connection and configures the agentic
   * loop options. The provider and model are auto-detected from environment variables
   * when not explicitly set.
   *
   * @param config - Agent configuration. All fields are optional.
   * @throws {Error} If the native provider cannot be created (e.g. invalid API key).
   *
   * @example
   * ```ts
   * const agent = new Agent({ instructions: "Be concise." });
   * ```
   *
   * @since 1.0.0
   */
  constructor(config: AgentConfig = {}) {
    const detected = detectProvider();
    this._provider = config.provider ?? detected?.provider ?? "openai";
    this._model = config.model ?? detected?.model ?? OPENAI_DEFAULT;
    this._name = config.name ?? "agent";
    this._instructions = config.instructions ?? "";

    const apiKey =
      config.providerOptions?.apiKey ?? resolveApiKey(this._provider);
    this.providerHandle = create_provider(this._provider, this._model, {
      apiKey,
      ...config.providerOptions,
    });

    if (config.tools) this._tools = [...config.tools];

    const ceOpt = config.codeExecution;
    const codeExecution = ceOpt === true
      ? { python: true, javascript: true, bash: true }
      : ceOpt || undefined;

    this._options = {
      instructions: this._instructions || undefined,
      temperature: config.temperature,
      maxSteps: config.maxSteps,
      topP: config.topP,
      maxTokens: config.maxTokens,
      seed: config.seed,
      stopOnTool: config.stopOnTool,
      outputSchema: config.outputSchema,
      thinkingBudget: config.thinkingBudget,
      reasoningEffort: config.reasoningEffort,
      cacheControl: config.cacheControl,
      codeExecution,
      grounding: config.grounding,
      nativeCodeExecution: config.nativeCodeExecution,
      responseModalities: config.responseModalities,
    };
  }

  // ─── Accessors ──────────────────────────────────────────────────

  /**
   * @description The agent's name.
   * @since 1.0.0
   */
  get name(): string { return this._name; }

  /**
   * @description The resolved LLM provider type.
   * @since 1.0.0
   */
  get provider(): ProviderType { return this._provider; }

  /**
   * @description The resolved model identifier.
   * @since 1.0.0
   */
  get model(): string { return this._model; }

  /**
   * @description The system instructions string.
   * @since 1.0.0
   */
  get instructions(): string { return this._instructions; }

  /**
   * @description Native provider handle. Used internally by Network, Graph, and other subsystems.
   * @since 1.0.0
   * @internal
   */
  get handle(): Handle { return this.providerHandle; }

  /**
   * @description Query what features this provider/model combination supports.
   * @returns The capability flags for the current provider and model.
   * @since 1.0.0
   */
  get capabilities(): import("./types.js").ProviderCapabilities {
    return get_provider_capabilities(this.providerHandle);
  }

  // ─── Fluent Configuration ───────────────────────────────────────

  /**
   * Register a single tool definition. Chainable.
   *
   * @description Appends a tool to the agent's tool list so the LLM can invoke it during the agentic loop.
   *
   * @param tool - The tool definition to add.
   * @returns `this` for fluent chaining.
   *
   * @example
   * ```ts
   * agent.addTool({ name: "search", description: "Web search", parameters: { query: { type: "string" } } });
   * ```
   *
   * @since 1.0.0
   */
  addTool(tool: ToolDef): this {
    this._tools.push(tool);
    return this;
  }

  /**
   * Register multiple tool definitions at once. Chainable.
   *
   * @description Appends all provided tools to the agent's tool list.
   *
   * @param tools - Array of tool definitions to add.
   * @returns `this` for fluent chaining.
   *
   * @example
   * ```ts
   * agent.addTools([
   *   { name: "search", description: "Web search", parameters: { query: { type: "string" } } },
   *   { name: "calculate", description: "Math calculator", parameters: { expr: { type: "string" } } },
   * ]);
   * ```
   *
   * @since 1.0.0
   */
  addTools(tools: ToolDef[]): this {
    this._tools.push(...tools);
    return this;
  }

  /**
   * Merge additional agent options into the current configuration. Chainable.
   *
   * @description Shallow-merges the provided options with the existing ones. Later calls override earlier values.
   *
   * @param options - Partial agent options to merge.
   * @returns `this` for fluent chaining.
   *
   * @example
   * ```ts
   * agent.setOptions({ temperature: 0.5, maxTokens: 1024 });
   * ```
   *
   * @since 1.0.0
   */
  setOptions(options: Partial<AgentOptions>): this {
    this._options = { ...this._options, ...options };
    return this;
  }

  // ─── Execution ──────────────────────────────────────────────────

  /**
   * Run the agentic loop to completion.
   *
   * @description Sends the input through the full agentic loop (tool calls, multi-step reasoning)
   * and returns the final result. Accepts either a plain string prompt or a pre-built message array.
   *
   * @param input - A string prompt or an array of {@link Message} objects.
   * @returns The completed {@link AgentResult} containing the response text, token counts, and optional structured output.
   * @throws {Error} If the agent has been destroyed.
   *
   * @example
   * ```ts
   * const result = await agent.run("Explain quantum computing");
   * console.log(result.text);
   * console.log(`Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
   * ```
   *
   * @since 1.0.0
   */
  async run(input: string | Message[]): Promise<AgentResult> {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return toSdkResult(await agent_run(
      this._name,
      this.providerHandle,
      this._tools,
      messages,
      this._options
    ));
  }

  /**
   * Run the agentic loop with a JavaScript-side tool executor.
   *
   * @description Like {@link Agent.run}, but delegates tool invocations to the provided
   * `toolExecutor` callback. Use this when tools need access to the Node.js runtime
   * (file system, network, databases, etc.).
   *
   * @param input - A string prompt or an array of {@link Message} objects.
   * @param toolExecutor - Async callback that receives a JSON-encoded tool call and returns a JSON-encoded result.
   * @returns The completed {@link AgentResult}.
   * @throws {Error} If the agent has been destroyed.
   *
   * @example
   * ```ts
   * const result = await agent.runWithTools("Search for cats", async (callJson) => {
   *   const call = JSON.parse(callJson);
   *   return JSON.stringify({ results: ["cat1", "cat2"] });
   * });
   * ```
   *
   * @since 1.0.0
   */
  async runWithTools(
    input: string | Message[],
    toolExecutor: ToolExecutor
  ): Promise<AgentResult> {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return toSdkResult(await agent_run_with_tool_executor(
      this._name,
      this.providerHandle,
      this._tools,
      messages,
      this._options,
      toolExecutor
    ));
  }

  /**
   * Stream agent responses with real-time events via a callback.
   *
   * @description Runs the agentic loop while invoking `onEvent` for each streaming event
   * (text deltas, tool calls, etc.). Returns the final aggregated result after the stream ends.
   *
   * @param input - A string prompt or an array of {@link Message} objects.
   * @param onEvent - Callback invoked with each JSON-encoded stream event.
   * @param toolExecutor - Optional async callback for handling tool invocations.
   * @returns The completed {@link AgentResult}.
   * @throws {Error} If the agent has been destroyed.
   *
   * @example
   * ```ts
   * const result = await agent.stream("Tell me a joke", (eventJson) => {
   *   const event = JSON.parse(eventJson);
   *   if (event.type === "text_delta") process.stdout.write(event.text ?? "");
   * });
   * ```
   *
   * @since 1.0.0
   */
  async stream(
    input: string | Message[],
    onEvent: StreamCallback,
    toolExecutor?: ToolExecutor
  ): Promise<AgentResult> {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return toSdkResult(await agent_stream_with_tool_executor(
      this._name,
      this.providerHandle,
      this._tools,
      messages,
      this._options,
      onEvent,
      toolExecutor ?? NOOP_TOOL_EXECUTOR
    ));
  }

  /**
   * Stream as an async iterable — use with `for await`.
   *
   * @description Returns an {@link AgentStream} that yields {@link StreamEvent} objects.
   * After iteration completes, the final {@link AgentResult} is available via
   * `stream.result`.
   *
   * @param input - A string prompt or an array of {@link Message} objects.
   * @param toolExecutor - Optional async callback for handling tool invocations.
   * @returns An {@link AgentStream} async iterable of {@link StreamEvent} objects.
   * @throws {Error} If the agent has been destroyed.
   *
   * @example
   * ```ts
   * const stream = agent.streamIter("Tell me a story");
   * for await (const event of stream) {
   *   if (event.type === "text_delta") process.stdout.write(event.text ?? "");
   * }
   * console.log(stream.result?.text);
   * ```
   *
   * @since 1.0.0
   */
  streamIter(
    input: string | Message[],
    toolExecutor?: ToolExecutor
  ): AgentStream {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return new AgentStream(
      this._name,
      this.providerHandle,
      this._tools,
      messages,
      this._options,
      toolExecutor ?? NOOP_TOOL_EXECUTOR
    );
  }

  /**
   * Perform a single raw LLM call without the agentic loop.
   *
   * @description Bypasses the multi-step agent loop and sends the input directly to the model
   * for a one-shot completion. Useful when you need a simple generation without tool use.
   *
   * @param input - A string prompt or an array of {@link Message} objects.
   * @param options - Optional generation parameters.
   * @param options.temperature - Sampling temperature override.
   * @param options.maxTokens - Maximum output tokens override.
   * @returns The raw provider response.
   *
   * @example
   * ```ts
   * const response = await agent.generate("Translate 'hello' to French", { temperature: 0 });
   * ```
   *
   * @since 1.0.0
   */
  async generate(
    input: string | Message[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<unknown> {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return generate(
      this.providerHandle,
      messages,
      options?.temperature,
      options?.maxTokens
    );
  }

  /**
   * Perform a single raw LLM call with tool definitions (no agentic loop).
   *
   * @description Like {@link Agent.generate}, but also passes tool definitions to the model.
   * The model may return tool-call requests in its response, but the caller is responsible
   * for executing them — no automatic loop is performed.
   *
   * @param input - A string prompt or an array of {@link Message} objects.
   * @param tools - Tool definitions to make available to the model.
   * @param options - Optional generation parameters.
   * @param options.temperature - Sampling temperature override.
   * @param options.maxTokens - Maximum output tokens override.
   * @returns The raw provider response, potentially containing tool call requests.
   *
   * @example
   * ```ts
   * const response = await agent.generateWithTools(
   *   "What's the weather?",
   *   [{ name: "get_weather", description: "Get weather", parameters: { city: { type: "string" } } }],
   * );
   * ```
   *
   * @since 1.0.0
   */
  async generateWithTools(
    input: string | Message[],
    tools: ToolDef[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<unknown> {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return generate_with_tools(
      this.providerHandle,
      messages,
      tools,
      options?.temperature,
      options?.maxTokens
    );
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  /**
   * Release all native resources held by this agent.
   *
   * @description Destroys the underlying native provider handle. Safe to call multiple times;
   * subsequent calls are no-ops. After calling `destroy()`, any further method calls on this
   * agent will throw.
   *
   * @since 1.0.0
   */
  destroy(): void {
    if (!this.disposed) {
      this.disposed = true;
      try {
        destroy_provider(this.providerHandle);
      } catch {
        // Already destroyed — safe to ignore.
      }
    }
  }

  /**
   * Alias for {@link Agent.destroy} — enables the TC39 `using` pattern.
   *
   * @example
   * ```ts
   * {
   *   using agent = new Agent({ instructions: "Be helpful." });
   *   const result = await agent.run("Hi!");
   * } // agent is automatically destroyed here
   * ```
   *
   * @since 1.0.0
   */
  [Symbol.dispose](): void {
    this.destroy();
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`Agent "${this._name}" has been destroyed`);
    }
  }
}

/** No-op tool executor — used when no tools are registered. */
const NOOP_TOOL_EXECUTOR: ToolExecutor = async () => "{}";

/**
 * One-liner convenience function — create an agent, run a prompt, and return the text.
 *
 * @description Creates a temporary {@link Agent}, sends the prompt through the agentic loop,
 * and returns just the response text. The agent is automatically destroyed after the call.
 * Ideal for quick, single-turn interactions.
 *
 * @param prompt - The user prompt to send to the agent.
 * @param config - Optional agent configuration (everything except `name`).
 * @returns The agent's response text.
 * @throws {Error} If the provider cannot be initialised or the call fails.
 *
 * @example
 * ```ts
 * import { gauss } from "gauss-ts";
 * const answer = await gauss("What is the meaning of life?");
 * console.log(answer);
 * ```
 *
 * @since 1.0.0
 */
export async function gauss(
  prompt: string,
  config?: Omit<AgentConfig, "name">
): Promise<string> {
  const agent = new Agent({ name: "gauss", ...config });
  try {
    const result = await agent.run(prompt);
    return result.text;
  } finally {
    agent.destroy();
  }
}
