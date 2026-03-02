/**
 * Typed Tool System — define tools with inline execute callbacks.
 *
 * Quick start:
 *   const weather = tool({
 *     name: "get_weather",
 *     description: "Get current weather for a city",
 *     parameters: { city: { type: "string", description: "City name" } },
 *     execute: async ({ city }) => ({ temp: 72, unit: "F", city }),
 *   });
 *   agent.addTools([weather]);
 *
 * The tool() helper creates a TypedToolDef that the agent auto-wires
 * into a ToolExecutor when it detects typed tools with execute callbacks.
 *
 * @since 1.2.0
 */

import type { ToolDef, ToolExecutor } from "./types.js";

// ─── Typed Tool Interface ────────────────────────────────────────────

/**
 * A tool definition with a typed execute callback.
 *
 * @typeParam TParams - The shape of the tool's input parameters.
 * @typeParam TResult - The shape of the tool's return value.
 */
export interface TypedToolDef<TParams = Record<string, unknown>, TResult = unknown> extends ToolDef {
  /** The function to execute when the LLM invokes this tool. */
  execute: (params: TParams) => Promise<TResult> | TResult;
}

// ─── tool() Helper ──────────────────────────────────────────────────

/**
 * Create a typed tool with an inline execute callback.
 *
 * @description Defines a tool that the agent can invoke during the agentic loop.
 * When the LLM calls this tool, the `execute` callback is automatically invoked
 * with the parsed parameters and the return value is sent back to the model.
 *
 * @param config - Tool configuration with name, description, parameters schema, and execute callback.
 * @returns A {@link TypedToolDef} that can be passed to `agent.addTool()` or `agent.addTools()`.
 *
 * @example
 * ```ts
 * const calculator = tool({
 *   name: "calculate",
 *   description: "Evaluate a math expression",
 *   parameters: {
 *     expression: { type: "string", description: "Math expression to evaluate" },
 *   },
 *   execute: async ({ expression }) => {
 *     return { result: eval(expression) };
 *   },
 * });
 *
 * const agent = new Agent({ instructions: "You can do math." });
 * agent.addTools([calculator]);
 * const result = await agent.run("What is 2+2?");
 * ```
 *
 * @since 1.2.0
 */
export function tool<TParams = Record<string, unknown>, TResult = unknown>(config: {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  execute: (params: TParams) => Promise<TResult> | TResult;
}): TypedToolDef<TParams, TResult> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
  };
}

// ─── Tool Executor Builder ──────────────────────────────────────────

/**
 * Check if a tool definition has an execute callback (is a TypedToolDef).
 */
export function isTypedTool(t: ToolDef): t is TypedToolDef {
  return typeof (t as TypedToolDef).execute === "function";
}

/**
 * Build a {@link ToolExecutor} from an array of typed tools.
 *
 * @description Creates a single async function that dispatches tool calls
 * to the correct typed tool's execute callback based on the tool name.
 *
 * @param tools - Array of typed tool definitions with execute callbacks.
 * @param fallback - Optional fallback executor for tools without execute callbacks.
 * @returns A {@link ToolExecutor} that can be passed to `agent.runWithTools()`.
 *
 * @since 1.2.0
 */
export function createToolExecutor(
  tools: TypedToolDef[],
  fallback?: ToolExecutor
): ToolExecutor {
  const toolMap = new Map(tools.map(t => [t.name, t]));

  return async (callJson: string): Promise<string> => {
    let call: { tool?: string; name?: string; args?: unknown; arguments?: unknown };
    try {
      call = JSON.parse(callJson);
    } catch {
      return JSON.stringify({ error: "Invalid tool call JSON" });
    }

    const toolName = call.tool ?? call.name ?? "";
    const toolDef = toolMap.get(toolName);

    if (!toolDef) {
      if (fallback) return fallback(callJson);
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }

    try {
      const params = (call.args ?? call.arguments ?? {}) as Record<string, unknown>;
      const result = await toolDef.execute(params);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: message });
    }
  };
}
