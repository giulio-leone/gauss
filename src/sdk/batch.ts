/**
 * Batch execution — run multiple prompts through an agent in parallel.
 *
 * @example
 *   import { batch } from "gauss-ts";
 *
 *   const results = await batch(
 *     ["Translate: Hello", "Translate: World"],
 *     { concurrency: 2, provider: "openai" }
 *   );
 *   results.forEach(r => console.log(r.result?.text ?? r.error?.message));
 */
import { Agent } from "./agent.js";
import type { AgentConfig } from "./agent.js";
import type { AgentResult } from "./types.js";

/**
 * Represents a single item in a batch execution.
 *
 * @description Each `BatchItem` holds the original input and, after execution, either
 * a successful {@link AgentResult} or an {@link Error}. Exactly one of `result` or `error`
 * will be populated after the batch completes.
 *
 * @typeParam T - The input type (defaults to `string`).
 *
 * @example
 * ```ts
 * const item: BatchItem = { input: "Translate: Hello", result: { text: "Bonjour", ... } };
 * if (item.error) console.error(item.error.message);
 * ```
 *
 * @since 1.0.0
 */
export interface BatchItem<T = string> {
  /** The original input prompt. */
  input: T;
  /** The successful agent result, if the execution succeeded. */
  result?: AgentResult;
  /** The error, if the execution failed. */
  error?: Error;
}

/**
 * Run multiple prompts through an agent in parallel with concurrency control.
 *
 * @description Creates a single shared {@link Agent} and dispatches all prompts through it
 * using a worker pool. Failed prompts do not abort the batch — their errors are captured
 * in the corresponding {@link BatchItem.error} field. The agent is automatically destroyed
 * after all prompts complete.
 *
 * @param prompts - Array of string prompts to process.
 * @param config - Optional agent configuration plus a `concurrency` field (default: `5`).
 * @returns An array of {@link BatchItem} objects, one per prompt, in the same order.
 * @throws {Error} If the agent cannot be created (e.g. missing API key).
 *
 * @example
 * ```ts
 * import { batch } from "gauss-ts";
 *
 * const results = await batch(
 *   ["Translate: Hello", "Translate: World", "Translate: Foo"],
 *   { concurrency: 2, provider: "openai" },
 * );
 * results.forEach(r => console.log(r.result?.text ?? r.error?.message));
 * ```
 *
 * @since 1.0.0
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
