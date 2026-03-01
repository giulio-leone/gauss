/**
 * Pipeline — compose agent operations into clean data flows.
 *
 * @example
 *   import { pipe, map, filter, tap } from "gauss-ts";
 *
 *   const result = await pipe(
 *     ["apple", "banana", "cherry"],
 *     map(fruit => agent.run(`Describe ${fruit}`)),
 *     filter(r => r.text.length > 50),
 *     tap(r => console.log(r.text)),
 *   );
 */

// ─── Types ─────────────────────────────────────────────────────────

/** An async transform step in a pipeline. */
export type PipeStep<I, O> = (input: I) => Promise<O> | O;

// ─── pipe ──────────────────────────────────────────────────────────

/**
 * Compose async operations into a pipeline.
 *
 * @example
 *   const result = await pipe(
 *     "Hello",
 *     (s) => agent.run(s),
 *     (r) => r.text.toUpperCase(),
 *   );
 */
export async function pipe<A>(input: A): Promise<A>;
export async function pipe<A, B>(input: A, s1: PipeStep<A, B>): Promise<B>;
export async function pipe<A, B, C>(input: A, s1: PipeStep<A, B>, s2: PipeStep<B, C>): Promise<C>;
export async function pipe<A, B, C, D>(input: A, s1: PipeStep<A, B>, s2: PipeStep<B, C>, s3: PipeStep<C, D>): Promise<D>;
export async function pipe<A, B, C, D, E>(input: A, s1: PipeStep<A, B>, s2: PipeStep<B, C>, s3: PipeStep<C, D>, s4: PipeStep<D, E>): Promise<E>;
export async function pipe(input: unknown, ...steps: PipeStep<unknown, unknown>[]): Promise<unknown> {
  let result = input;
  for (const step of steps) {
    result = await step(result);
  }
  return result;
}

// ─── Async collection helpers ──────────────────────────────────────

/**
 * Map an async function over an array with concurrency control.
 *
 * @example
 *   const results = await mapAsync(
 *     ["a", "b", "c"],
 *     (item) => agent.run(item),
 *     { concurrency: 2 }
 *   );
 */
export async function mapAsync<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options?: { concurrency?: number }
): Promise<R[]> {
  const concurrency = options?.concurrency ?? items.length;
  const results: R[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      results[entry.index] = await fn(entry.item, entry.index);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Filter items using an async predicate with concurrency control.
 *
 * @example
 *   const valid = await filterAsync(items, async (item) => {
 *     const result = await agent.run(`Is "${item}" valid?`);
 *     return result.text.includes("yes");
 *   });
 */
export async function filterAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<boolean>,
  options?: { concurrency?: number }
): Promise<T[]> {
  const flags = await mapAsync(items, predicate, options);
  return items.filter((_, i) => flags[i]);
}

/**
 * Reduce items using an async reducer (sequential).
 *
 * @example
 *   const summary = await reduceAsync(
 *     documents,
 *     async (acc, doc) => {
 *       const result = await agent.run(`Combine: ${acc}\n\nNew: ${doc}`);
 *       return result.text;
 *     },
 *     ""
 *   );
 */
export async function reduceAsync<T, R>(
  items: T[],
  reducer: (accumulator: R, item: T, index: number) => Promise<R>,
  initial: R
): Promise<R> {
  let result = initial;
  for (let i = 0; i < items.length; i++) {
    result = await reducer(result, items[i], i);
  }
  return result;
}

/**
 * Execute a side-effect for each item (sequential). Returns input unchanged.
 * Useful in pipelines for logging or monitoring.
 *
 * @example
 *   await tapAsync(results, async (r) => console.log(r.text));
 */
export async function tapAsync<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void> | void
): Promise<T[]> {
  for (let i = 0; i < items.length; i++) {
    await fn(items[i], i);
  }
  return items;
}

// ─── Compose ───────────────────────────────────────────────────────

/**
 * Compose multiple middleware-style functions into one.
 *
 * @example
 *   const enhance = compose(
 *     async (text) => `[System] ${text}`,
 *     async (text) => text.trim(),
 *   );
 *   const result = await enhance("  hello  ");
 *   // → "[System] hello"
 */
export function compose<T>(...fns: PipeStep<T, T>[]): PipeStep<T, T> {
  return async (input: T): Promise<T> => {
    let result = input;
    for (const fn of fns) {
      result = await fn(result);
    }
    return result;
  };
}
