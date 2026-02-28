// =============================================================================
// AI SDK V3 Adapter — Wraps external @ai-sdk/* models for Gauss compatibility
// =============================================================================
//
// The Gauss LLM core uses a custom LanguageModel interface derived from AI SDK v1.
// External providers (@ai-sdk/openai v3, @ai-sdk/anthropic, etc.) implement
// LanguageModelV3 which has a different doGenerate/doStream signature.
//
// This adapter transparently bridges the two formats.
// =============================================================================

import type {
  LanguageModel,
  LanguageModelGenerateOptions,
  LanguageModelGenerateResult,
  LanguageModelStreamResult,
  CoreMessage,
  ToolCall,
} from "./types.js";

// ---------------------------------------------------------------------------
// V3 model shape (structural typing — no import from @ai-sdk/provider needed)
// ---------------------------------------------------------------------------

interface V3TextPart {
  type: "text";
  text: string;
}

interface V3ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
}

interface V3ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

type V3ContentPart = V3TextPart | V3ToolCallPart | V3ToolResultPart;

interface V3Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | V3ContentPart[];
}

interface V3FunctionTool {
  type: "function";
  name: string;
  description?: string;
  inputSchema: unknown;
}

interface V3GenerateResult {
  text?: string;
  content?: Array<{
    type: string;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    args?: unknown;
  }>;
  toolCalls?: Array<{
    toolCallType: "function";
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  usage: {
    inputTokens: number | { total: number };
    outputTokens: number | { total: number };
  };
  finishReason: string | { unified: string; raw: string };
  response?: unknown;
}

interface V3Model {
  specificationVersion: string;
  provider: string;
  modelId: string;
  defaultObjectGenerationMode?: string;
  doGenerate(options: Record<string, unknown>): Promise<V3GenerateResult>;
  doStream(options: Record<string, unknown>): Promise<{ stream: ReadableStream }>;
}

// ---------------------------------------------------------------------------
// Detect if a model is V3 (has prompt-based doGenerate, not mode-based)
// ---------------------------------------------------------------------------

function isV3Model(model: unknown): model is V3Model {
  if (!model || typeof model !== "object") return false;
  const m = model as Record<string, unknown>;
  return (
    typeof m.doGenerate === "function" &&
    typeof m.provider === "string" &&
    typeof m.modelId === "string" &&
    (m.specificationVersion === "v2" || m.specificationVersion === "v3")
  );
}

// ---------------------------------------------------------------------------
// Convert Gauss messages → V3 messages
// ---------------------------------------------------------------------------

function toV3Messages(messages: CoreMessage[]): V3Message[] {
  return messages.map((msg) => {
    // System messages: V3 expects content as string
    if (msg.role === "system") {
      const content = typeof msg.content === "string"
        ? msg.content
        : (msg.content as V3ContentPart[])
          .filter((p) => p.type === "text")
          .map((p) => (p as V3TextPart).text)
          .join("");
      return { role: "system" as const, content };
    }

    // User messages: V3 expects content as ContentPart[]
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        return {
          role: "user" as const,
          content: [{ type: "text" as const, text: msg.content }],
        };
      }
      return msg as V3Message;
    }

    // Assistant messages: convert tool-call parts (args→input)
    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        return {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: msg.content }],
        };
      }
      const parts = (msg.content as V3ContentPart[]).map((part) => {
        if (part.type === "tool-call") {
          const tc = part as unknown as {
            type: "tool-call";
            toolCallType?: string;
            toolCallId: string;
            toolName: string;
            args?: string;
            input?: unknown;
          };
          return {
            type: "tool-call" as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.input ?? (tc.args ? JSON.parse(tc.args) : {}),
          };
        }
        return part;
      });
      return { role: "assistant" as const, content: parts };
    }

    // Tool messages: convert tool-result parts (result→output)
    if (msg.role === "tool") {
      const parts = (msg.content as Array<{
        type: string;
        toolCallId: string;
        toolName: string;
        result?: unknown;
        output?: unknown;
        isError?: boolean;
      }>).map((part) => {
        if (part.type === "tool-result") {
          const resultStr = typeof part.result === "string"
            ? part.result
            : JSON.stringify(part.result ?? "");
          return {
            type: "tool-result" as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: part.output ?? {
              type: part.isError ? "error-text" as const : "text" as const,
              value: resultStr,
            },
          };
        }
        return part;
      });
      return { role: "tool" as const, content: parts as V3ContentPart[] };
    }

    return msg as V3Message;
  });
}

// ---------------------------------------------------------------------------
// Convert Gauss tool definitions → V3 function tools
// ---------------------------------------------------------------------------

function toV3Tools(
  mode: LanguageModelGenerateOptions["mode"],
): V3FunctionTool[] | undefined {
  if (mode.type !== "regular" || !mode.tools || mode.tools.length === 0) {
    return undefined;
  }
  return mode.tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    inputSchema: t.parameters,
  }));
}

// ---------------------------------------------------------------------------
// Convert V3 result → Gauss result
// ---------------------------------------------------------------------------

function fromV3Result(result: V3GenerateResult): LanguageModelGenerateResult {
  // Extract text: prefer top-level, fallback to content array
  let text = result.text ?? "";
  if (!text && result.content) {
    text = result.content
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("");
  }

  // Extract finish reason: V3 returns {unified, raw}, we need the string
  const finishReason = typeof result.finishReason === "string"
    ? result.finishReason
    : (result.finishReason as { unified: string }).unified;

  // Extract tool calls: may be in top-level toolCalls or in content array
  let toolCalls: ToolCall[] = [];
  if (result.toolCalls && result.toolCalls.length > 0) {
    toolCalls = result.toolCalls.map((tc) => ({
      toolCallType: "function" as const,
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args),
    }));
  } else if (result.content) {
    toolCalls = result.content
      .filter((p) => p.type === "tool-call" && p.toolCallId && p.toolName)
      .map((p) => ({
        toolCallType: "function" as const,
        toolCallId: p.toolCallId!,
        toolName: p.toolName!,
        args: typeof p.input === "string"
          ? p.input
          : typeof p.args === "string"
            ? p.args
            : JSON.stringify(p.input ?? p.args ?? {}),
      }));
  }

  // Extract usage: V3 may nest as {total, ...}
  const inputTokens = typeof result.usage.inputTokens === "number"
    ? result.usage.inputTokens
    : (result.usage.inputTokens as { total: number }).total;
  const outputTokens = typeof result.usage.outputTokens === "number"
    ? result.usage.outputTokens
    : (result.usage.outputTokens as { total: number }).total;

  return {
    text,
    toolCalls,
    usage: { inputTokens, outputTokens },
    finishReason: finishReason as LanguageModelGenerateResult["finishReason"],
    response: result.response,
  };
}

// ---------------------------------------------------------------------------
// Build V3 responseFormat from Gauss mode
// ---------------------------------------------------------------------------

function toV3ResponseFormat(mode: LanguageModelGenerateOptions["mode"]) {
  if (mode.type === "object-json") {
    return {
      type: "json" as const,
      ...(mode.schema ? { schema: mode.schema } : {}),
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public: wrapV3Model
// ---------------------------------------------------------------------------

/**
 * Wrap an AI SDK V3 model to be compatible with Gauss LanguageModel interface.
 * If the model is not V3, returns it unchanged.
 */
export function wrapV3Model(model: unknown): LanguageModel {
  if (!isV3Model(model)) {
    return model as LanguageModel;
  }

  const v3 = model;

  return {
    specificationVersion: v3.specificationVersion,
    provider: v3.provider,
    modelId: v3.modelId,
    defaultObjectGenerationMode: v3.defaultObjectGenerationMode,

    async doGenerate(
      options: LanguageModelGenerateOptions,
    ): Promise<LanguageModelGenerateResult> {
      const v3Options: Record<string, unknown> = {
        prompt: toV3Messages(options.prompt),
        tools: toV3Tools(options.mode),
        responseFormat: toV3ResponseFormat(options.mode),
        abortSignal: options.abortSignal,
      };

      if (options.mode.type === "regular" && options.mode.toolChoice) {
        v3Options.toolChoice = options.mode.toolChoice;
      }

      const result = await v3.doGenerate(v3Options);
      return fromV3Result(result);
    },

    async doStream(
      options: LanguageModelGenerateOptions,
    ): Promise<LanguageModelStreamResult> {
      const v3Options: Record<string, unknown> = {
        prompt: toV3Messages(options.prompt),
        tools: toV3Tools(options.mode),
        responseFormat: toV3ResponseFormat(options.mode),
        abortSignal: options.abortSignal,
      };

      if (options.mode.type === "regular" && options.mode.toolChoice) {
        v3Options.toolChoice = options.mode.toolChoice;
      }

      const result = await v3.doStream(v3Options);
      return result as unknown as LanguageModelStreamResult;
    },
  };
}
