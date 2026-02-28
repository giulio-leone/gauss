// =============================================================================
// Gauss LLM Core — Native Bridge
// Routes LLM calls through Rust via NAPI when a GaussLanguageModel is detected.
// Falls back to pure TS path transparently.
// =============================================================================

import type {
  LanguageModel,
  ToolSet,
  TokenUsage,
  GenerateTextResult,
  StreamTextResult,
  StepResult,
  ToolResult,
  FinishReason,
  StreamPart,
} from "./types.js";
import { zodToJsonSchema } from "../schema/zod-to-json-schema.js";

// ---------------------------------------------------------------------------
// Native detection
// ---------------------------------------------------------------------------

/** Marker symbol that GaussLanguageModel sets on itself. */
export const GAUSS_NATIVE_MARKER = Symbol.for("gauss.native.model");

interface NativeLanguageModel extends LanguageModel {
  [key: symbol]: boolean;
  getHandle(): number;
  provider: string;
}

/** Check if a model is backed by native Rust via NAPI. */
export function isNativeModel(model: LanguageModel): model is NativeLanguageModel {
  return (model as any)[GAUSS_NATIVE_MARKER] === true;
}

// ---------------------------------------------------------------------------
// Native generateText
// ---------------------------------------------------------------------------

export interface NativeGenerateOptions {
  model: NativeLanguageModel;
  prompt?: string;
  messages?: Array<{ role: string; content: string | unknown[] }>;
  system?: string;
  tools?: ToolSet;
  maxSteps?: number;
  temperature?: number;
  maxTokens?: number;
  output?: { schema?: unknown };
  onStepFinish?: (step: StepResult<any>) => void | Promise<void>;
  onFinish?: (result: GenerateTextResult<any>) => void | Promise<void>;
}

/**
 * Execute generateText natively in Rust.
 * Falls back to undefined if NAPI is unavailable.
 */
export async function nativeGenerateText<TOOLS extends ToolSet = ToolSet>(
  options: NativeGenerateOptions,
): Promise<GenerateTextResult<TOOLS> | undefined> {
  try {
    const { gaussAgentRun } = await import("../../providers/gauss.js");

    const messages = buildNativeMessages(options);
    const nativeTools = options.tools
      ? Object.entries(options.tools).map(([name, def]) => ({
          name,
          description: def.description ?? "",
          parameters: def.parameters ? zodToJsonSchema(def.parameters) : undefined,
          execute: def.execute
            ? async (args: Record<string, unknown>) => {
                const result = await def.execute!(args, { toolCallId: "native" });
                return result;
              }
            : undefined,
        }))
      : [];

    const result = await gaussAgentRun(
      "native-generate",
      options.model.getHandle(),
      nativeTools,
      messages,
      {
        instructions: options.system,
        maxSteps: options.maxSteps,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        outputSchema: options.output?.schema ? zodToJsonSchema(options.output.schema) : undefined,
      },
    );

    const step: StepResult<TOOLS> = {
      text: result.text,
      toolCalls: [],
      toolResults: [],
      finishReason: "stop",
      usage: result.usage,
    };

    if (options.onStepFinish) await options.onStepFinish(step);

    const finalResult: GenerateTextResult<TOOLS> = {
      text: result.text,
      toolCalls: [],
      toolResults: [],
      finishReason: "stop",
      usage: result.usage,
      steps: [step],
    };

    if (options.onFinish) await options.onFinish(finalResult);

    return finalResult;
  } catch {
    return undefined; // Fallback to TS path
  }
}

// ---------------------------------------------------------------------------
// Native streamText
// ---------------------------------------------------------------------------

export interface NativeStreamOptions {
  model: NativeLanguageModel;
  prompt?: string;
  messages?: Array<{ role: string; content: string | unknown[] }>;
  system?: string;
  tools?: ToolSet;
  maxSteps?: number;
  temperature?: number;
  maxTokens?: number;
  onStepFinish?: (step: StepResult<any>) => void | Promise<void>;
  onFinish?: (event: { text: string; usage: TokenUsage; finishReason: FinishReason }) => void | Promise<void>;
}

/**
 * Execute streamText natively in Rust.
 * Falls back to undefined if NAPI is unavailable.
 */
export function nativeStreamText<TOOLS extends ToolSet = ToolSet>(
  options: NativeStreamOptions,
): StreamTextResult<TOOLS> | undefined {
  try {
    // Dynamic import to avoid hard dependency on providers module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { gaussAgentStream } = require("../../providers/gauss.js") as typeof import("../../providers/gauss.js");

    const messages = buildNativeMessages(options);
    const nativeTools = options.tools
      ? Object.entries(options.tools).map(([name, def]) => ({
          name,
          description: def.description ?? "",
          parameters: def.parameters ? zodToJsonSchema(def.parameters) : undefined,
          execute: def.execute
            ? async (args: Record<string, unknown>) => {
                const result = await def.execute!(args, { toolCallId: "native" });
                return result;
              }
            : undefined,
        }))
      : [];

    const { events, result: resultPromise } = gaussAgentStream(
      "native-stream",
      options.model.getHandle(),
      nativeTools,
      messages,
      {
        instructions: options.system,
        maxSteps: options.maxSteps,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      },
    );

    // Build text stream + full stream from native events
    let resolveText: (v: string) => void;
    let resolveUsage: (v: TokenUsage) => void;
    let resolveFinish: (v: FinishReason) => void;
    let resolveToolCalls: (v: any[]) => void;
    let resolveToolResults: (v: ToolResult[]) => void;
    let resolveSteps: (v: StepResult<TOOLS>[]) => void;

    const textPromise = new Promise<string>((r) => { resolveText = r; });
    const usagePromise = new Promise<TokenUsage>((r) => { resolveUsage = r; });
    const finishPromise = new Promise<FinishReason>((r) => { resolveFinish = r; });
    const toolCallsPromise = new Promise<any[]>((r) => { resolveToolCalls = r; });
    const toolResultsPromise = new Promise<ToolResult[]>((r) => { resolveToolResults = r; });
    const stepsPromise = new Promise<StepResult<TOOLS>[]>((r) => { resolveSteps = r; });

    const fullStream = new ReadableStream<StreamPart>({
      async start(controller) {
        try {
          let fullText = "";
          for await (const event of events) {
            switch (event.type) {
              case "text_delta":
                fullText += event.delta ?? "";
                controller.enqueue({ type: "text-delta", textDelta: event.delta ?? "" });
                break;
              case "done": {
                const usage: TokenUsage = {
                  inputTokens: event.inputTokens ?? 0,
                  outputTokens: event.outputTokens ?? 0,
                };
                controller.enqueue({
                  type: "finish",
                  finishReason: "stop" as FinishReason,
                  usage,
                });
                resolveText!(fullText);
                resolveUsage!(usage);
                resolveFinish!("stop");
                resolveToolCalls!([]);
                resolveToolResults!([]);
                resolveSteps!([{
                  text: fullText,
                  toolCalls: [],
                  toolResults: [],
                  finishReason: "stop",
                  usage,
                }]);
                if (options.onFinish) {
                  await options.onFinish({ text: fullText, usage, finishReason: "stop" });
                }
                break;
              }
              case "error":
                controller.error(new Error(event.error ?? "Native stream error"));
                break;
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    // Text-only stream (tee from fullStream)
    const [mainStream, teeStream] = fullStream.tee();
    const textStream = new ReadableStream<string>({
      async start(controller) {
        const reader = teeStream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.type === "text-delta") controller.enqueue(value.textDelta);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return {
      textStream,
      fullStream: mainStream,
      text: textPromise,
      toolCalls: toolCallsPromise,
      toolResults: toolResultsPromise,
      finishReason: finishPromise,
      usage: usagePromise,
      steps: stepsPromise,
    };
  } catch {
    return undefined; // Fallback to TS path
  }
}

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

function buildNativeMessages(options: { prompt?: string; messages?: Array<{ role: string; content: string | unknown[] }>; system?: string }): Array<{ role: string; content: string }> {
  const msgs: Array<{ role: string; content: string }> = [];
  if (options.system) msgs.push({ role: "system", content: options.system });
  if (options.messages) {
    msgs.push(...options.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })));
  }
  if (options.prompt) msgs.push({ role: "user", content: options.prompt });
  return msgs;
}

// zodToJsonSchema imported from core/schema/zod-to-json-schema
