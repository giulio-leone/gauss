// =============================================================================
// Gauss LLM Core — generateText
// Multi-step tool-loop text generation. Zero external dependencies.
// =============================================================================

import type {
  LanguageModel,
  LanguageModelTool,
  ToolSet,
  StepResult,
  ToolCall,
  ToolResult,
  TokenUsage,
  GenerateTextResult,
  FinishReason,
  CoreMessage,
  ToolChoice,
} from "./types.js";
import type { StopCondition } from "./stop-conditions.js";
import type { OutputSpec } from "./output.js";
import { isNativeModel, nativeGenerateText } from "./native-bridge.js";
import { zodToJsonSchema } from "../schema/zod-to-json-schema.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface GenerateTextOptions<TOOLS extends ToolSet = ToolSet> {
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
  onFinish?: (event: GenerateTextResult<TOOLS>) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// zodToJsonSchema imported from core/schema/zod-to-json-schema

function toolsToLanguageModelTools(tools: ToolSet): LanguageModelTool[] {
  return Object.entries(tools).map(([name, def]) => ({
    type: "function" as const,
    name,
    description: def.description,
    parameters: zodToJsonSchema(def.parameters),
  }));
}

function buildMessages(options: GenerateTextOptions): CoreMessage[] {
  const msgs: CoreMessage[] = [];
  if (options.system) {
    msgs.push({ role: "system", content: options.system });
  }
  if (options.messages) {
    msgs.push(...options.messages);
  }
  if (options.prompt) {
    msgs.push({ role: "user", content: options.prompt });
  }
  return msgs;
}

/**
 * Normalize messages for AI SDK v2/v3 compatibility.
 * External providers (e.g. @ai-sdk/openai v3) expect content as ContentPart[],
 * not raw strings. This converts string content → [{type:'text', text}].
 */
async function executeTools(
  toolCalls: ToolCall[],
  tools: ToolSet,
  abortSignal?: AbortSignal,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const toolDef = tools[call.toolName];
    if (!toolDef?.execute) {
      // Tool without execute — requires human approval or external handling
      break;
    }
    try {
      const args = typeof call.args === "string" ? JSON.parse(call.args) : call.args;
      const result = await toolDef.execute(args, { abortSignal, toolCallId: call.toolCallId });
      results.push({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result,
      });
    } catch (err) {
      results.push({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result: String(err),
        isError: true,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// generateText
// ---------------------------------------------------------------------------

/**
 * Generate text with optional multi-step tool loop.
 * Calls the model, executes tool calls, feeds results back until done.
 */
export async function generateText<TOOLS extends ToolSet = ToolSet>(
  options: GenerateTextOptions<TOOLS>,
): Promise<GenerateTextResult<TOOLS>> {
  // Native Rust fast-path: if model is GaussLanguageModel, delegate entirely to Rust
  if (isNativeModel(options.model)) {
    const nativeResult = await nativeGenerateText<TOOLS>({
      model: options.model,
      prompt: options.prompt,
      messages: options.messages,
      system: options.system,
      tools: options.tools as ToolSet,
      maxSteps: options.maxSteps,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      output: options.output,
      onStepFinish: options.onStepFinish,
      onFinish: options.onFinish,
    });
    if (nativeResult) return nativeResult;
    // If native failed, fall through to TS path
  }

  const { model, tools, stopWhen, maxSteps, abortSignal, onStepFinish, onFinish } = options;
  const lmTools = tools ? toolsToLanguageModelTools(tools as ToolSet) : undefined;

  const messages = buildMessages(options);
  const steps: StepResult<TOOLS>[] = [];
  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  const stopConditions: Array<StopCondition<ToolSet>> = [];
  if (stopWhen) {
    if (Array.isArray(stopWhen)) stopConditions.push(...(stopWhen as StopCondition<ToolSet>[]));
    else stopConditions.push(stopWhen as StopCondition<ToolSet>);
  }
  if (maxSteps && stopConditions.length === 0) {
    stopConditions.push(({ steps: s }) => s.length >= maxSteps);
  }
  // Default: max 20 steps
  if (stopConditions.length === 0) {
    stopConditions.push(({ steps: s }) => s.length >= 20);
  }

  let lastText = "";
  let lastFinishReason: FinishReason = "stop";
  let lastToolCalls: ToolCall[] = [];
  let lastToolResults: ToolResult[] = [];
  let lastResponse: StepResult<TOOLS>["response"];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Build mode
    const mode = lmTools && lmTools.length > 0
      ? { type: "regular" as const, tools: lmTools, toolChoice: options.toolChoice }
      : options.output
        ? { type: "object-json" as const, schema: zodToJsonSchema(options.output.schema) }
        : { type: "regular" as const };

    const result = await model.doGenerate({
      inputFormat: "messages",
      mode,
      prompt: messages,
      abortSignal,
    });

    totalUsage.inputTokens += result.usage.inputTokens;
    totalUsage.outputTokens += result.usage.outputTokens;

    lastText = result.text ?? "";
    lastFinishReason = result.finishReason;
    lastToolCalls = result.toolCalls ?? [];
    lastResponse = result.response;

    // Execute tool calls
    if (lastFinishReason === "tool-calls" && lastToolCalls.length > 0 && tools) {
      lastToolResults = await executeTools(lastToolCalls, tools as ToolSet, abortSignal);

      // Add assistant message with tool calls
      const toolCallParts = lastToolCalls.map((tc) => ({
        type: "tool-call" as const,
        toolCallType: "function" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      }));
      messages.push({ role: "assistant", content: lastText ? [{ type: "text", text: lastText }, ...toolCallParts] : toolCallParts });

      // Add tool result messages
      const toolResultParts = lastToolResults.map((tr) => ({
        type: "tool-result" as const,
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        result: tr.result,
        isError: tr.isError,
      }));
      messages.push({ role: "tool", content: toolResultParts });
    } else {
      lastToolResults = [];
    }

    const step: StepResult<TOOLS> = {
      text: lastText,
      toolCalls: lastToolCalls.map((tc) => ({
        toolCallType: "function" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: typeof tc.args === "string" ? JSON.parse(tc.args) : tc.args,
      })),
      toolResults: lastToolResults,
      finishReason: lastFinishReason,
      usage: { ...result.usage },
      response: lastResponse,
    };
    steps.push(step);

    if (onStepFinish) await onStepFinish(step);

    // Check stop conditions
    const shouldStop = await Promise.all(
      stopConditions.map((cond) => cond({ steps: steps as StepResult<ToolSet>[] })),
    );
    if (shouldStop.some(Boolean)) break;

    // If no tool calls, we're done
    if (lastFinishReason !== "tool-calls" || lastToolCalls.length === 0) break;

    // If a tool has no execute function, stop (needs human approval)
    const hasUnexecutableTool = lastToolCalls.some((tc) => !(tools as ToolSet)[tc.toolName]?.execute);
    if (hasUnexecutableTool) break;
  }

  const finalResult: GenerateTextResult<TOOLS> = {
    text: lastText,
    toolCalls: lastToolCalls.map((tc) => ({
      toolCallType: "function" as const,
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: typeof tc.args === "string" ? JSON.parse(tc.args) : tc.args,
    })),
    toolResults: lastToolResults,
    finishReason: lastFinishReason,
    usage: totalUsage,
    steps,
    response: lastResponse,
  };

  if (onFinish) await onFinish(finalResult);

  return finalResult;
}
