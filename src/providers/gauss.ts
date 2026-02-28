// =============================================================================
// gauss/providers/gauss — Native Rust-backed provider via NAPI
// =============================================================================
//
// Uses gauss-core's Rust LLM providers through NAPI bindings.
// Supports: OpenAI, Anthropic, Google, Groq, Ollama, DeepSeek
// Provides: generateText/streamText compatible LanguageModel interface
//
// Usage:
//   import { gauss } from 'gauss/providers'
//   const model = gauss('openai', 'gpt-4o')
//   const agent = Agent({ model, instructions: '...' })
//

import type {
  LanguageModel,
  LanguageModelGenerateOptions,
  LanguageModelGenerateResult,
  LanguageModelStreamResult,
  FinishReason,
  StreamPart,
} from "../core/llm/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GaussProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "ollama"
  | "deepseek";

export interface GaussProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  organization?: string;
}

// ---------------------------------------------------------------------------
// NAPI Module Loader
// ---------------------------------------------------------------------------

interface NapiModule {
  version(): string;
  createProvider(type: string, model: string, options: {
    apiKey: string;
    baseUrl: string | null;
    timeoutMs: number | null;
    maxRetries: number | null;
    organization: string | null;
  }): number;
  destroyProvider(handle: number): void;
  generate(
    handle: number,
    messages: Array<{ role: string; content: string }>,
    temperature: number | null,
    maxTokens: number | null,
  ): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number }; finishReason: string }>;
  generateWithTools(
    handle: number,
    messages: Array<{ role: string; content: string }>,
    tools: Array<{ name: string; description: string; parameters: unknown | null }>,
    temperature: number | null,
    maxTokens: number | null,
  ): Promise<{
    text: string;
    toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
    usage: { inputTokens: number; outputTokens: number };
    finishReason: string;
  }>;
  agentRunWithToolExecutor(
    name: string,
    providerHandle: number,
    tools: Array<{ name: string; description: string; parameters: unknown | null }>,
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown>,
    toolExecutor: (callJson: string) => Promise<string>,
  ): Promise<{
    text: string;
    steps: number;
    inputTokens: number;
    outputTokens: number;
    structuredOutput?: unknown;
  }>;
  countTokens(text: string): number;
  countTokensForModel(text: string, model: string): number;
  cosineSimilarity(a: number[], b: number[]): number;
  agentStreamWithToolExecutor(
    name: string,
    providerHandle: number,
    tools: Array<{ name: string; description: string; parameters: unknown | null }>,
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown>,
    streamCallback: (eventJson: string) => void,
    toolExecutor: (callJson: string) => Promise<string>,
  ): Promise<{
    text: string;
    steps: number;
    inputTokens: number;
    outputTokens: number;
    structuredOutput?: unknown;
  }>;
}

let _napi: NapiModule | null = null;

/** Inject a custom NAPI module (for testing or custom backends). */
export function setNapi(napi: NapiModule | null): void {
  _napi = napi;
}

function getNapi(): NapiModule {
  if (_napi) return _napi;

  // Try multiple resolution strategies
  const paths = [
    "@gauss-ai/core",
    "@giulio-leone/gauss-core-napi",
    // Direct path for development (built by `napi build`)
    process.env["GAUSS_NAPI_PATH"],
  ].filter(Boolean);

  for (const p of paths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _napi = require(p as string) as NapiModule;
      return _napi;
    } catch {
      continue;
    }
  }

  throw new Error(
    "gauss-core NAPI module not found. Install @gauss-ai/core or set GAUSS_NAPI_PATH.\n" +
      "  npm install @gauss-ai/core"
  );
}

// ---------------------------------------------------------------------------
// Handle Registry (track provider handles for cleanup)
// ---------------------------------------------------------------------------

const activeHandles = new Map<number, { provider: string; model: string }>();

function createHandle(
  type: GaussProviderType,
  model: string,
  options: GaussProviderOptions,
): number {
  const napi = getNapi();
  const apiKey = options.apiKey ?? inferApiKey(type);
  const handle = napi.createProvider(type, model, {
    apiKey,
    baseUrl: options.baseUrl ?? null,
    timeoutMs: options.timeoutMs ?? null,
    maxRetries: options.maxRetries ?? null,
    organization: options.organization ?? null,
  });
  activeHandles.set(handle, { provider: type, model });
  return handle;
}

function inferApiKey(type: GaussProviderType): string {
  const envMap: Record<GaussProviderType, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_AI_API_KEY",
    groq: "GROQ_API_KEY",
    ollama: "", // No key needed
    deepseek: "DEEPSEEK_API_KEY",
  };
  const envVar = envMap[type];
  if (!envVar) return "";
  const key = process.env[envVar];
  if (!key) {
    throw new Error(
      `Missing API key for ${type}. Set ${envVar} environment variable.`,
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// FinishReason mapping
// ---------------------------------------------------------------------------

function mapFinishReason(reason: string): FinishReason {
  const map: Record<string, FinishReason> = {
    Stop: "stop",
    ToolCalls: "tool-calls",
    Length: "length",
    ContentFilter: "content-filter",
  };
  return map[reason] ?? "other";
}

// ---------------------------------------------------------------------------
// GaussLanguageModel — implements LanguageModel
// ---------------------------------------------------------------------------

class GaussLanguageModel implements LanguageModel {
  readonly specificationVersion = "v1";
  readonly provider: string;
  readonly modelId: string;
  readonly defaultObjectGenerationMode = "json";

  private handle: number;

  constructor(
    type: GaussProviderType,
    model: string,
    options: GaussProviderOptions = {},
  ) {
    this.provider = `gauss-${type}`;
    this.modelId = model;
    this.handle = createHandle(type, model, options);
  }

  /** Get the raw NAPI provider handle (for advanced usage). */
  getHandle(): number {
    return this.handle;
  }

  async doGenerate(
    options: LanguageModelGenerateOptions,
  ): Promise<LanguageModelGenerateResult> {
    const napi = getNapi();
    const messages = options.prompt.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

    // Extract tools from mode
    const tools =
      options.mode.type === "regular" && options.mode.tools
        ? options.mode.tools.map((t) => ({
            name: t.name,
            description: t.description ?? "",
            parameters: t.parameters ?? null,
          }))
        : [];

    if (tools.length > 0) {
      const result = await napi.generateWithTools(
        this.handle,
        messages,
        tools,
        null, // temperature from provider config
        null, // maxTokens from provider config
      );

      return {
        text: result.text || undefined,
        toolCalls: result.toolCalls?.map((tc) => ({
          toolCallType: "function" as const,
          toolCallId: tc.id,
          toolName: tc.name,
          args: JSON.stringify(tc.args),
        })),
        finishReason: mapFinishReason(result.finishReason),
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
        rawCall: { rawPrompt: messages, rawSettings: {} },
      };
    }

    const result = await napi.generate(this.handle, messages, null, null);

    return {
      text: result.text || undefined,
      toolCalls: [],
      finishReason: mapFinishReason(result.finishReason),
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
      rawCall: { rawPrompt: messages, rawSettings: {} },
    };
  }

  async doStream(
    options: LanguageModelGenerateOptions,
  ): Promise<LanguageModelStreamResult> {
    const napi = getNapi();
    const messages = options.prompt.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

    const tools =
      options.mode.type === "regular" && options.mode.tools
        ? options.mode.tools.map((t) => ({
            name: t.name,
            description: t.description ?? "",
            parameters: t.parameters ?? null,
          }))
        : [];

    let controller: ReadableStreamDefaultController<StreamPart>;
    const stream = new ReadableStream<StreamPart>({
      start(c) {
        controller = c;
      },
    });

    // Stream callback receives events from Rust
    const streamCallback = (eventJson: string): void => {
      try {
        const event = JSON.parse(eventJson);
        switch (event.type) {
          case "text_delta":
            controller.enqueue({
              type: "text-delta",
              textDelta: event.delta,
            });
            break;
          case "tool_result":
            // Tool results don't map directly to StreamPart, but we can emit them
            // as raw events or handle them in the consumer
            break;
          case "step_finish":
            // Multi-step events for agent consumers
            break;
          case "done":
            controller.enqueue({
              type: "finish",
              finishReason: mapFinishReason(event.finishReason ?? "Stop"),
              usage: {
                inputTokens: event.inputTokens ?? 0,
                outputTokens: event.outputTokens ?? 0,
              },
            });
            controller.close();
            break;
          case "error":
            controller.error(new Error(event.error));
            break;
        }
      } catch {
        // Ignore parse errors in stream events
      }
    };

    // Tool executor for streaming mode
    const toolExecutor = async (_callJson: string): Promise<string> => {
      // In LanguageModel.doStream(), tools aren't executed — just reported.
      // The tool execution happens at the Agent level.
      return JSON.stringify({ error: "Tool execution not supported in doStream" });
    };

    // Fire-and-forget: the streaming happens via callbacks
    napi
      .agentStreamWithToolExecutor(
        "stream",
        this.handle,
        tools,
        messages,
        {},
        streamCallback,
        toolExecutor,
      )
      .catch((err: Error) => {
        try {
          controller.error(err);
        } catch {
          // Controller may already be closed
        }
      });

    return {
      stream,
      rawCall: { rawPrompt: messages, rawSettings: {} },
    };
  }

  /** Destroy the underlying provider and release resources. */
  destroy(): void {
    const napi = getNapi();
    napi.destroyProvider(this.handle);
    activeHandles.delete(this.handle);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a native Rust-backed language model via gauss-core.
 *
 * @example
 * ```ts
 * import { gauss } from 'gauss-ai/providers'
 *
 * const model = gauss('openai', 'gpt-4o')
 * const agent = Agent({ model, instructions: 'You are helpful.' })
 * ```
 */
export function gauss(
  type: GaussProviderType,
  model: string,
  options?: GaussProviderOptions,
): GaussLanguageModel {
  return new GaussLanguageModel(type, model, options);
}

/**
 * Run an agent's tool loop natively in Rust.
 * Tools with execute functions are called back to JS via NAPI ThreadsafeFunction.
 */
export async function gaussAgentRun(
  name: string,
  providerHandle: number,
  tools: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    execute?: (args: Record<string, unknown>) => Promise<unknown>;
  }>,
  messages: Array<{ role: string; content: string }>,
  options: {
    instructions?: string;
    maxSteps?: number;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    seed?: number;
    stopOnTool?: string;
    outputSchema?: Record<string, unknown>;
  } = {},
): Promise<{
  text: string;
  steps: number;
  usage: { inputTokens: number; outputTokens: number };
  structuredOutput?: unknown;
}> {
  const napi = getNapi();

  const toolSchemas = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters ?? null,
  }));

  const napiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const napiOptions = {
    instructions: options.instructions ?? null,
    maxSteps: options.maxSteps ?? null,
    temperature: options.temperature ?? null,
    topP: options.topP ?? null,
    maxTokens: options.maxTokens ?? null,
    seed: options.seed ?? null,
    stopOnTool: options.stopOnTool ?? null,
    outputSchema: options.outputSchema ?? null,
  };

  const hasExecuteFns = tools.some((t) => typeof t.execute === "function");

  if (hasExecuteFns) {
    const executorMap = new Map<
      string,
      (args: Record<string, unknown>) => Promise<unknown>
    >();
    for (const t of tools) {
      if (t.execute) executorMap.set(t.name, t.execute);
    }

    const toolExecutor = async (callJson: string): Promise<string> => {
      const { tool, args } = JSON.parse(callJson);
      const fn = executorMap.get(tool);
      if (!fn) throw new Error(`No execute function for tool: ${tool}`);
      const result = await fn(args);
      return JSON.stringify(result);
    };

    const result = await napi.agentRunWithToolExecutor(
      name,
      providerHandle,
      toolSchemas,
      napiMessages,
      napiOptions,
      toolExecutor,
    );

    return {
      text: result.text,
      steps: result.steps,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      structuredOutput: result.structuredOutput,
    };
  }

  // No execute fns — pure Rust agent loop
  const result = await napi.agentRunWithToolExecutor(
    name,
    providerHandle,
    toolSchemas,
    napiMessages,
    napiOptions,
    async () => {
      throw new Error("Unexpected tool call — no execute functions registered");
    },
  );

  return {
    text: result.text,
    steps: result.steps,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
    structuredOutput: result.structuredOutput,
  };
}

/** Stream event from native agent execution. */
export interface NativeStreamEvent {
  type: "step_start" | "text_delta" | "tool_call_delta" | "tool_result" | "step_finish" | "done" | "error" | "raw_event";
  step?: number;
  delta?: string;
  index?: number;
  toolName?: string;
  result?: unknown;
  isError?: boolean;
  finishReason?: string;
  hasToolCalls?: boolean;
  text?: string;
  steps?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

/**
 * Stream an agent execution natively in Rust.
 * Returns an AsyncIterable of stream events + a promise for the final result.
 */
export function gaussAgentStream(
  name: string,
  providerHandle: number,
  tools: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    execute?: (args: Record<string, unknown>) => Promise<unknown>;
  }>,
  messages: Array<{ role: string; content: string }>,
  options: {
    instructions?: string;
    maxSteps?: number;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    seed?: number;
    stopOnTool?: string;
    outputSchema?: Record<string, unknown>;
  } = {},
): {
  events: AsyncIterable<NativeStreamEvent>;
  result: Promise<{
    text: string;
    steps: number;
    usage: { inputTokens: number; outputTokens: number };
    structuredOutput?: unknown;
  }>;
} {
  const napi = getNapi();

  const toolSchemas = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters ?? null,
  }));

  const napiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const napiOptions = {
    instructions: options.instructions ?? null,
    maxSteps: options.maxSteps ?? null,
    temperature: options.temperature ?? null,
    topP: options.topP ?? null,
    maxTokens: options.maxTokens ?? null,
    seed: options.seed ?? null,
    stopOnTool: options.stopOnTool ?? null,
    outputSchema: options.outputSchema ?? null,
  };

  // Build tool executor
  const executorMap = new Map<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  >();
  for (const t of tools) {
    if (t.execute) executorMap.set(t.name, t.execute);
  }
  const toolExecutor = async (callJson: string): Promise<string> => {
    const { tool, args } = JSON.parse(callJson);
    const fn = executorMap.get(tool);
    if (!fn) throw new Error(`No execute function for tool: ${tool}`);
    const result = await fn(args);
    return JSON.stringify(result);
  };

  // Event queue for async iteration
  const eventQueue: NativeStreamEvent[] = [];
  let resolveNext: ((value: IteratorResult<NativeStreamEvent>) => void) | null = null;
  let streamDone = false;

  const streamCallback = (eventJson: string): void => {
    try {
      const event = JSON.parse(eventJson) as NativeStreamEvent;
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ value: event, done: false });
      } else {
        eventQueue.push(event);
      }
      if (event.type === "done" || event.type === "error") {
        streamDone = true;
      }
    } catch {
      // Ignore parse errors
    }
  };

  const resultPromise = napi
    .agentStreamWithToolExecutor(
      name,
      providerHandle,
      toolSchemas,
      napiMessages,
      napiOptions,
      streamCallback,
      toolExecutor,
    )
    .then((r) => ({
      text: r.text,
      steps: r.steps,
      usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens },
      structuredOutput: r.structuredOutput,
    }));

  const events: AsyncIterable<NativeStreamEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<NativeStreamEvent>> {
          if (eventQueue.length > 0) {
            return Promise.resolve({ value: eventQueue.shift()!, done: false });
          }
          if (streamDone) {
            return Promise.resolve({ value: undefined as any, done: true });
          }
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
      };
    },
  };

  return { events, result: resultPromise };
}

// ---------------------------------------------------------------------------
// Native utilities (exposed from Rust)
// ---------------------------------------------------------------------------

/** Count tokens in text using tiktoken (native speed). */
export function countTokens(text: string): number {
  return getNapi().countTokens(text);
}

/** Count tokens for a specific model. */
export function countTokensForModel(text: string, model: string): number {
  return getNapi().countTokensForModel(text, model);
}

/** Native cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  return getNapi().cosineSimilarity(a, b);
}

/** Check if gauss-core NAPI is available. */
export function isNativeAvailable(): boolean {
  try {
    getNapi();
    return true;
  } catch {
    return false;
  }
}

/** Get gauss-core version string. */
export function nativeVersion(): string {
  return getNapi().version();
}
