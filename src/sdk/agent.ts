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
  version,
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

// ─── Config ────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Agent name (default: "agent"). */
  name?: string;

  /** LLM provider. Auto-detected from env if omitted. */
  provider?: ProviderType;

  /** Model identifier. Auto-selected if omitted. */
  model?: string;

  /** Provider connection options. API key auto-resolved from env if omitted. */
  providerOptions?: ProviderOptions;

  /** System instructions. */
  instructions?: string;

  /** Tool definitions. */
  tools?: ToolDef[];

  /** Temperature (0–2). */
  temperature?: number;

  /** Max agent steps. */
  maxSteps?: number;

  /** Top-p sampling. */
  topP?: number;

  /** Max output tokens. */
  maxTokens?: number;

  /** Deterministic seed. */
  seed?: number;

  /** Stop when this tool is called. */
  stopOnTool?: string;

  /** JSON schema for structured output. */
  outputSchema?: Record<string, unknown>;

  /** Extended thinking budget (Anthropic). Number of tokens for internal reasoning. */
  thinkingBudget?: number;

  /** Enable prompt caching (Anthropic). Auto-annotates system messages and tools. */
  cacheControl?: boolean;
}

// ─── Agent Class ───────────────────────────────────────────────────

export class Agent implements Disposable {
  private readonly providerHandle: Handle;
  private readonly _name: string;
  private readonly _provider: ProviderType;
  private readonly _model: string;
  private readonly _instructions: string;
  private _tools: ToolDef[] = [];
  private _options: AgentOptions = {};
  private disposed = false;

  constructor(config: AgentConfig = {}) {
    // Auto-detect provider/model from environment if not specified
    const detected = detectProvider();
    this._provider = config.provider ?? detected?.provider ?? "openai";
    this._model = config.model ?? detected?.model ?? "gpt-4o";
    this._name = config.name ?? "agent";
    this._instructions = config.instructions ?? "";

    const apiKey =
      config.providerOptions?.apiKey ?? resolveApiKey(this._provider);
    this.providerHandle = create_provider(this._provider, this._model, {
      apiKey,
      ...config.providerOptions,
    });

    if (config.tools) this._tools = [...config.tools];
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
      cacheControl: config.cacheControl,
    };
  }

  // ─── Accessors ──────────────────────────────────────────────────

  get name(): string { return this._name; }
  get provider(): ProviderType { return this._provider; }
  get model(): string { return this._model; }
  get instructions(): string { return this._instructions; }

  /** Native handle — used internally by Network, Graph, etc. */
  get handle(): Handle { return this.providerHandle; }

  // ─── Fluent Configuration ───────────────────────────────────────

  /** Add a single tool. Chainable. */
  addTool(tool: ToolDef): this {
    this._tools.push(tool);
    return this;
  }

  /** Add multiple tools. Chainable. */
  addTools(tools: ToolDef[]): this {
    this._tools.push(...tools);
    return this;
  }

  /** Merge additional options. Chainable. */
  setOptions(options: Partial<AgentOptions>): this {
    this._options = { ...this._options, ...options };
    return this;
  }

  // ─── Execution ──────────────────────────────────────────────────

  /**
   * Run the agent. Accepts a string prompt or a message array.
   *
   * @example
   *   // Simple string prompt
   *   const result = await agent.run("Explain quantum computing");
   *
   *   // Message array
   *   const result = await agent.run([
   *     { role: "system", content: "You are a physicist." },
   *     { role: "user", content: "Explain quantum computing" },
   *   ]);
   */
  async run(input: string | Message[]): Promise<AgentResult> {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return agent_run(
      this._name,
      this.providerHandle,
      this._tools,
      messages,
      this._options
    );
  }

  /**
   * Run with a JS-side tool executor for tools that need Node.js access.
   *
   * The executor receives a JSON string `{ name, arguments }` and must
   * return the tool result as a JSON string.
   */
  async runWithTools(
    input: string | Message[],
    toolExecutor: ToolExecutor
  ): Promise<AgentResult> {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return agent_run_with_tool_executor(
      this._name,
      this.providerHandle,
      this._tools,
      messages,
      this._options,
      toolExecutor
    );
  }

  /**
   * Stream agent responses with real-time events.
   *
   * @param input - String prompt or message array.
   * @param onEvent - Called for each stream event (JSON string).
   * @param toolExecutor - JS-side tool executor.
   */
  async stream(
    input: string | Message[],
    onEvent: StreamCallback,
    toolExecutor: ToolExecutor
  ): Promise<AgentResult> {
    this.assertNotDisposed();
    const messages = typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input;
    return agent_stream_with_tool_executor(
      this._name,
      this.providerHandle,
      this._tools,
      messages,
      this._options,
      onEvent,
      toolExecutor
    );
  }

  /**
   * Stream as an async iterable — use with `for await`.
   *
   * @example
   *   for await (const event of agent.streamIter("Tell me a story", toolExecutor)) {
   *     process.stdout.write(event.text ?? "");
   *   }
   */
  streamIter(
    input: string | Message[],
    toolExecutor: ToolExecutor
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
      toolExecutor
    );
  }

  /**
   * Raw LLM call without the agent loop. Returns the provider's raw response.
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
   * Raw LLM call with tool definitions. Returns tool calls if the model requests them.
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

  /** Release all native resources. Safe to call multiple times. */
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

  /** Alias for destroy — for `using` pattern support. */
  [Symbol.dispose](): void {
    this.destroy();
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`Agent "${this._name}" has been destroyed`);
    }
  }

  // ─── Static ─────────────────────────────────────────────────────

  /** Gauss core version. */
  static version(): string {
    return version();
  }
}

// ─── Quick-start factory ───────────────────────────────────────────

/**
 * One-liner agent call.
 *
 * @example
 *   import { gauss } from "gauss-ai";
 *   const answer = await gauss("What is the meaning of life?");
 *   // → "The meaning of life is..."
 *
 *   // With options:
 *   const answer = await gauss("Translate to French: Hello world", {
 *     provider: "anthropic",
 *     model: "claude-sonnet-4-20250514",
 *     temperature: 0,
 *   });
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

// ─── Async iterable stream ─────────────────────────────────────────

/** Parsed stream event. */
export interface StreamEvent {
  type: string;
  text?: string;
  toolCall?: { name: string; arguments: string };
  [key: string]: unknown;
}

/**
 * Async iterable wrapper over the native stream callback.
 *
 * @example
 *   for await (const event of agent.streamIter("Tell me a story", executor)) {
 *     if (event.type === "text_delta") process.stdout.write(event.text ?? "");
 *   }
 *   // Access final result after iteration:
 *   const result = stream.result;
 */
export class AgentStream implements AsyncIterable<StreamEvent> {
  private _result: AgentResult | undefined;

  constructor(
    private readonly agentName: string,
    private readonly providerHandle: Handle,
    private readonly tools: ToolDef[],
    private readonly messages: Message[],
    private readonly options: AgentOptions,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  /** Final result — available after iteration completes. */
  get result(): AgentResult | undefined { return this._result; }

  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    const buffer: StreamEvent[] = [];
    let resolve: (() => void) | undefined;
    let done = false;

    const onEvent = (json: string) => {
      try {
        buffer.push(JSON.parse(json) as StreamEvent);
      } catch {
        buffer.push({ type: "raw", text: json });
      }
      resolve?.();
    };

    const runPromise = agent_stream_with_tool_executor(
      this.agentName,
      this.providerHandle,
      this.tools,
      this.messages,
      this.options,
      onEvent,
      this.toolExecutor
    ).then((r) => {
      this._result = r;
      done = true;
      resolve?.();
    });

    while (!done || buffer.length > 0) {
      if (buffer.length > 0) {
        yield buffer.shift()!;
      } else if (!done) {
        await new Promise<void>((r) => { resolve = r; });
      }
    }

    await runPromise;
  }
}

// ─── Batch execution ───────────────────────────────────────────────

export interface BatchItem<T = string> {
  input: T;
  result?: AgentResult;
  error?: Error;
}

/**
 * Run multiple prompts through an agent in parallel with concurrency control.
 *
 * @example
 *   const results = await batch(
 *     ["Translate: Hello", "Translate: World", "Translate: Foo"],
 *     { concurrency: 2, provider: "openai" }
 *   );
 *   results.forEach(r => console.log(r.result?.text ?? r.error?.message));
 */
export async function batch(
  prompts: string[],
  config?: Omit<AgentConfig, "name"> & { concurrency?: number }
): Promise<BatchItem[]> {
  const { concurrency = 5, ...agentConfig } = config ?? {};
  const items: BatchItem[] = prompts.map((input) => ({ input }));

  const agent = new Agent({ name: "batch", ...agentConfig });
  try {
    const queue = [...items.entries()];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) break;
        const [idx, item] = entry;
        try {
          items[idx].result = await agent.run(item.input);
        } catch (err) {
          items[idx].error = err instanceof Error ? err : new Error(String(err));
        }
      }
    });
    await Promise.all(workers);
  } finally {
    agent.destroy();
  }
  return items;
}
