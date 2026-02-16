// =============================================================================
// Stream JSON — Utility that yields Partial<T> objects from a token stream
// =============================================================================

import { createDefaultPartialJsonAdapter } from "../adapters/partial-json/default-partial-json.adapter.js";

/**
 * Takes an AsyncIterable of string tokens (e.g. from LLM streaming) and
 * yields `Partial<T>` objects as they become available via incremental parsing.
 *
 * Only yields when the parsed value actually changes.
 */
export async function* streamJson<T>(
  tokens: AsyncIterable<string>,
): AsyncGenerator<Partial<T>> {
  const adapter = createDefaultPartialJsonAdapter();
  const accumulator = adapter.createAccumulator<T>();
  let lastJson: string | null = null;

  for await (const token of tokens) {
    accumulator.push(token);
    const current = accumulator.current();

    if (current !== null) {
      const currentJson = JSON.stringify(current);
      if (currentJson !== lastJson) {
        lastJson = currentJson;
        yield current;
      }
    }
  }
}
