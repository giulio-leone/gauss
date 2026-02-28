// =============================================================================
// Gauss LLM Core — Output Specification
// Structured output mode for generateText / streamText.
// =============================================================================

import type { ZodType } from "zod";

export interface OutputSpec<T = unknown> {
  type: "object";
  schema: ZodType<T>;
}

/**
 * Output specification — instructs the model to produce structured JSON output.
 *
 * @example
 * ```ts
 * const result = await generateText({
 *   model,
 *   output: Output.object({ schema: z.object({ name: z.string() }) }),
 *   prompt: "Generate a person",
 * });
 * ```
 */
export const Output = {
  object<T>(config: { schema: ZodType<T> }): OutputSpec<T> {
    return { type: "object", schema: config.schema };
  },
};
