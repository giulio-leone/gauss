/**
 * Tests for pipeline and async helper utilities.
 */
import { describe, it, expect } from "vitest";

import { pipe, mapAsync, filterAsync, reduceAsync, tapAsync, compose } from "../pipeline.js";

describe("pipe", () => {
  it("passes input through no steps", async () => {
    expect(await pipe("hello")).toBe("hello");
  });

  it("chains sync steps", async () => {
    const result = await pipe(
      5,
      (n: number) => n * 2,
      (n: number) => n + 1,
    );
    expect(result).toBe(11);
  });

  it("chains async steps", async () => {
    const result = await pipe(
      "hello",
      async (s: string) => s.toUpperCase(),
      async (s: string) => `${s}!`,
    );
    expect(result).toBe("HELLO!");
  });

  it("mixes sync and async", async () => {
    const result = await pipe(
      10,
      (n: number) => n * 2,
      async (n: number) => n + 5,
      (n: number) => `${n}`,
    );
    expect(result).toBe("25");
  });
});

describe("mapAsync", () => {
  it("maps over items", async () => {
    const results = await mapAsync(
      [1, 2, 3],
      async (n) => n * 2,
    );
    expect(results).toEqual([2, 4, 6]);
  });

  it("preserves order", async () => {
    const results = await mapAsync(
      [3, 1, 2],
      async (n) => {
        await new Promise(r => setTimeout(r, n));
        return n;
      },
    );
    expect(results).toEqual([3, 1, 2]);
  });

  it("respects concurrency", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const results = await mapAsync(
      [1, 2, 3, 4],
      async (n) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 5));
        concurrent--;
        return n;
      },
      { concurrency: 2 },
    );
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(results).toEqual([1, 2, 3, 4]);
  });
});

describe("filterAsync", () => {
  it("filters items with async predicate", async () => {
    const result = await filterAsync(
      [1, 2, 3, 4, 5],
      async (n) => n % 2 === 0,
    );
    expect(result).toEqual([2, 4]);
  });
});

describe("reduceAsync", () => {
  it("reduces sequentially", async () => {
    const result = await reduceAsync(
      [1, 2, 3],
      async (acc, n) => acc + n,
      0,
    );
    expect(result).toBe(6);
  });

  it("builds string from items", async () => {
    const result = await reduceAsync(
      ["a", "b", "c"],
      async (acc, s) => `${acc}${s}`,
      "",
    );
    expect(result).toBe("abc");
  });
});

describe("tapAsync", () => {
  it("executes side effects and returns input", async () => {
    const log: number[] = [];
    const result = await tapAsync([1, 2, 3], async (n) => { log.push(n); });
    expect(result).toEqual([1, 2, 3]);
    expect(log).toEqual([1, 2, 3]);
  });
});

describe("compose", () => {
  it("composes functions left to right", async () => {
    const fn = compose(
      async (s: string) => s.toUpperCase(),
      async (s: string) => `[${s}]`,
    );
    expect(await fn("hello")).toBe("[HELLO]");
  });

  it("handles single function", async () => {
    const fn = compose(async (n: number) => n * 2);
    expect(await fn(5)).toBe(10);
  });
});
