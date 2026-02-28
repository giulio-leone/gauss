// =============================================================================
// Gauss LLM Core — streamText
// Streaming multi-step tool-loop text generation.
// =============================================================================

import type {
  LanguageModel,
  LanguageModelTool,
  ToolSet,
  StepResult,
  ToolCall,
  ToolResult,
  TokenUsage,
  StreamTextResult,
  FinishReason,
  CoreMessage,
  StreamPart,
  ToolChoice,
} from "./types.js";
import type { StopCondition } from "./stop-conditions.js";
import type { OutputSpec } from "./output.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface StreamTextOptions<TOOLS extends ToolSet = ToolSet> {
  model: LanguageModel;
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  tools?: TOOLS;
  toolChoice?: ToolChoice;
  stopWhen?: StopCondition<TOOLS> | Array<StopCondition<TOOLS>>;
  maxSteps?: number;
  output?: OutputSpec;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  onStepFinish?: (event: StepResult<TOOLS>) => void | Promise<void>;
  onFinish?: (event: { text: string; usage: TokenUsage; finishReason: FinishReason }) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers (shared with generateText)
// ---------------------------------------------------------------------------

function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema) return {};
  const s = schema as { _def?: { typeName?: string }; shape?: unknown };
  if (s._def?.typeName === "ZodObject" && s.shape) {
    const shape = typeof s.shape === "function" ? (s.shape as () => Record<string, unknown>)() : s.shape as Record<string, unknown>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      const f = val as { _def?: { typeName?: string; description?: string }; isOptional?: () => boolean };
      properties[key] = { type: "string" };
      if (f._def?.typeName === "ZodString") properties[key] = { type: "string" };
      else if (f._def?.typeName === "ZodNumber") properties[key] = { type: "number" };
      else if (f._def?.typeName === "ZodBoolean") properties[key] = { type: "boolean" };
      else if (f._def?.typeName === "ZodArray") properties[key] = { type: "array" };
      if (f._def?.description) (properties[key] as Record<string, unknown>).description = f._def.description;
      if (typeof f.isOptional !== "function" || !f.isOptional()) required.push(key);
    }
    return { type: "object", properties, ...(required.length > 0 ? { required } : {}) };
  }
  return { type: "object" };
}

function toolsToLanguageModelTools(tools: ToolSet): LanguageModelTool[] {
  return Object.entries(tools).map(([name, def]) => ({
    type: "function" as const,
    name,
    description: def.description,
    parameters: zodToJsonSchema(def.parameters),
  }));
}

function buildMessages(options: StreamTextOptions): CoreMessage[] {
  const msgs: CoreMessage[] = [];
  if (options.system) msgs.push({ role: "system", content: options.system });
  if (options.messages) msgs.push(...options.messages);
  if (options.prompt) msgs.push({ role: "user", content: options.prompt });
  return msgs;
}

// ---------------------------------------------------------------------------
// streamText
// ---------------------------------------------------------------------------

/**
 * Stream text from a language model with optional multi-step tool loop.
 * Returns a result object with promise-based accessors for the final values.
 */
export function streamText<TOOLS extends ToolSet = ToolSet>(
  options: StreamTextOptions<TOOLS>,
): StreamTextResult<TOOLS> {
  const { model, tools, abortSignal } = options;
  const lmTools = tools ? toolsToLanguageModelTools(tools as ToolSet) : undefined;
  const messages = buildMessages(options);

  // Shared mutable state accumulated during streaming
  let resolveText: (v: string) => void;
  let resolveUsage: (v: TokenUsage) => void;
  let resolveFinish: (v: FinishReason) => void;
  let resolveToolCalls: (v: Array<{ toolCallType: "function"; toolCallId: string; toolName: string; args: unknown }>) => void;
  let resolveToolResults: (v: ToolResult[]) => void;
  let resolveSteps: (v: StepResult<TOOLS>[]) => void;

  const textPromise = new Promise<string>((r) => { resolveText = r; });
  const usagePromise = new Promise<TokenUsage>((r) => { resolveUsage = r; });
  const finishPromise = new Promise<FinishReason>((r) => { resolveFinish = r; });
  const toolCallsPromise = new Promise<Array<{ toolCallType: "function"; toolCallId: string; toolName: string; args: unknown }>>((r) => { resolveToolCalls = r; });
  const toolResultsPromise = new Promise<ToolResult[]>((r) => { resolveToolResults = r; });
  const stepsPromise = new Promise<StepResult<TOOLS>[]>((r) => { resolveSteps = r; });

  // Create the full stream (piped to both textStream and fullStream)
  const fullStream = new ReadableStream<StreamPart>({
    async start(controller) {
      try {
        const mode = lmTools && lmTools.length > 0
          ? { type: "regular" as const, tools: lmTools }
          : { type: "regular" as const };

        const result = await model.doStream({
          inputFormat: "messages",
          mode,
          prompt: messages,
          abortSignal,
        });

        const reader = result.stream.getReader();
        let fullText = "";
        const allToolCalls: ToolCall[] = [];
        const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
        let lastFinish: FinishReason = "stop";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const part = value as StreamPart;
          controller.enqueue(part);

          if (part.type === "text-delta") {
            fullText += part.textDelta;
          } else if (part.type === "tool-call") {
            allToolCalls.push({
              toolCallType: "function",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
            });
          } else if (part.type === "finish") {
            lastFinish = part.finishReason;
            totalUsage.inputTokens += part.usage.inputTokens;
            totalUsage.outputTokens += part.usage.outputTokens;
          }
        }

        // Execute tool calls if any
        let toolResults: ToolResult[] = [];
        if (allToolCalls.length > 0 && tools) {
          for (const call of allToolCalls) {
            const toolDef = (tools as ToolSet)[call.toolName];
            if (toolDef?.execute) {
              try {
                const args = typeof call.args === "string" ? JSON.parse(call.args) : call.args;
                const result = await toolDef.execute(args, { abortSignal, toolCallId: call.toolCallId });
                toolResults.push({ toolCallId: call.toolCallId, toolName: call.toolName, result });
              } catch (err) {
                toolResults.push({ toolCallId: call.toolCallId, toolName: call.toolName, result: String(err), isError: true });
              }
            }
          }
        }

        const step: StepResult<TOOLS> = {
          text: fullText,
          toolCalls: allToolCalls.map((tc) => ({
            toolCallType: "function" as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: typeof tc.args === "string" ? JSON.parse(tc.args) : tc.args,
          })),
          toolResults,
          finishReason: lastFinish,
          usage: totalUsage,
        };

        resolveText!(fullText);
        resolveUsage!(totalUsage);
        resolveFinish!(lastFinish);
        resolveToolCalls!(step.toolCalls);
        resolveToolResults!(toolResults);
        resolveSteps!([step]);

        if (options.onStepFinish) await options.onStepFinish(step);
        if (options.onFinish) await options.onFinish({ text: fullText, usage: totalUsage, finishReason: lastFinish });

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  // Text-only stream
  const textStream = new ReadableStream<string>({
    async start(controller) {
      const reader = fullStream.getReader();
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.type === "text-delta") {
            controller.enqueue(value.textDelta);
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return {
    textStream,
    fullStream,
    text: textPromise,
    toolCalls: toolCallsPromise,
    toolResults: toolResultsPromise,
    finishReason: finishPromise,
    usage: usagePromise,
    steps: stepsPromise,
  };
}
