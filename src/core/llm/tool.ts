// =============================================================================
// Gauss LLM Core — Tool Factory
// Creates tool definitions with Zod schema validation.
// =============================================================================

import { z, type ZodType } from "zod";
import type { Tool, ToolExecuteOptions } from "./types.js";

export interface ToolConfig<PARAMS extends z.ZodTypeAny = z.ZodTypeAny, RESULT = unknown> {
  description?: string;
  inputSchema: PARAMS;
  execute?: (args: z.infer<PARAMS>, options?: ToolExecuteOptions) => Promise<RESULT>;
}

/**
 * Creates a typed tool definition from a Zod schema.
 *
 * @example
 * ```ts
 * import { tool } from "gauss";
 * import { z } from "zod";
 *
 * const weatherTool = tool({
 *   description: "Get weather for a location",
 *   inputSchema: z.object({ city: z.string() }),
 *   execute: async ({ city }) => ({ temp: 72, city }),
 * });
 * ```
 */
export function tool<PARAMS extends z.ZodTypeAny, RESULT = unknown>(
  config: ToolConfig<PARAMS, RESULT>,
): Tool<z.infer<PARAMS>, RESULT> {
  return {
    type: "function",
    description: config.description,
    parameters: config.inputSchema as unknown as ZodType<z.infer<PARAMS>>,
    execute: config.execute,
  };
}
