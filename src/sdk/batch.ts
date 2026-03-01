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

export interface BatchItem<T = string> {
  input: T;
  result?: AgentResult;
  error?: Error;
}

/**
 * Run multiple prompts through an agent in parallel with concurrency control.
 *
 * @param prompts - Array of string prompts.
 * @param config - Agent config + optional `concurrency` (default: 5).
 * @returns Array of BatchItem, one per prompt.
 *
 * @example
 *   const results = await batch(
 *     ["Translate: Hello", "Translate: World", "Translate: Foo"],
 *     { concurrency: 2, provider: "openai" }
 *   );
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
