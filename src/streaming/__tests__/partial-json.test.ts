import { describe, it, expect } from "vitest";

import { createDefaultPartialJsonAdapter } from "../../adapters/partial-json/default-partial-json.adapter.js";
import { streamJson } from "../stream-json.js";

// =============================================================================
// Helpers
// =============================================================================

function adapter() {
  return createDefaultPartialJsonAdapter();
}

/** Turn a string into an async iterable of single characters. */
async function* chars(s: string): AsyncIterable<string> {
  for (const ch of s) yield ch;
}

/** Turn a string array into an async iterable. */
async function* chunks(arr: string[]): AsyncIterable<string> {
  for (const c of arr) yield c;
}

/** Collect all values from an AsyncGenerator into an array. */
async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const v of gen) result.push(v);
  return result;
}

// =============================================================================
// parse() — Simple Types
// =============================================================================

describe("PartialJsonAdapter.parse — simple types", () => {
  it("parses a complete string", () => {
    const { value, complete } = adapter().parse('"hello"');
    expect(value).toBe("hello");
    expect(complete).toBe(true);
  });

  it("parses a partial string (unclosed quote)", () => {
    const { value, complete } = adapter().parse('"hel');
    expect(value).toBe("hel");
    expect(complete).toBe(false);
  });

  it("parses a complete number", () => {
    const { value, complete } = adapter().parse("42");
    expect(value).toBe(42);
    expect(complete).toBe(true);
  });

  it("parses a complete boolean (true)", () => {
    const { value, complete } = adapter().parse("true");
    expect(value).toBe(true);
    expect(complete).toBe(true);
  });

  it("parses a complete boolean (false)", () => {
    const { value, complete } = adapter().parse("false");
    expect(value).toBe(false);
    expect(complete).toBe(true);
  });

  it("parses null", () => {
    const { value, complete } = adapter().parse("null");
    expect(value).toBe(null);
    expect(complete).toBe(true);
  });

  it("returns undefined value for empty input", () => {
    const { value, complete } = adapter().parse("");
    expect(value).toBeUndefined();
    expect(complete).toBe(false);
  });
});

// =============================================================================
// parse() — Objects
// =============================================================================

describe("PartialJsonAdapter.parse — objects", () => {
  it("parses a complete object", () => {
    const { value, complete } = adapter().parse('{"a":1,"b":"x"}');
    expect(value).toEqual({ a: 1, b: "x" });
    expect(complete).toBe(true);
  });

  it("parses an object with unclosed brace", () => {
    const { value, complete } = adapter().parse('{"a":1');
    expect(value).toEqual({ a: 1 });
    expect(complete).toBe(false);
  });

  it("parses an object with partial value (unclosed string)", () => {
    const { value, complete } = adapter().parse('{"name":"Alu');
    expect(value).toEqual({ name: "Alu" });
    expect(complete).toBe(false);
  });

  it("parses a nested object", () => {
    const { value, complete } = adapter().parse('{"a":{"b":1');
    expect(value).toEqual({ a: { b: 1 } });
    expect(complete).toBe(false);
  });

  it("handles trailing comma in object", () => {
    const { value, complete } = adapter().parse('{"a":1,');
    expect(value).toEqual({ a: 1 });
    expect(complete).toBe(false);
  });
});

// =============================================================================
// parse() — Arrays
// =============================================================================

describe("PartialJsonAdapter.parse — arrays", () => {
  it("parses a complete array", () => {
    const { value, complete } = adapter().parse("[1,2,3]");
    expect(value).toEqual([1, 2, 3]);
    expect(complete).toBe(true);
  });

  it("parses an array with unclosed bracket", () => {
    const { value, complete } = adapter().parse("[1,2");
    expect(value).toEqual([1, 2]);
    expect(complete).toBe(false);
  });

  it("parses nested arrays", () => {
    const { value, complete } = adapter().parse("[[1,2],[3");
    expect(value).toEqual([[1, 2], [3]]);
    expect(complete).toBe(false);
  });

  it("handles trailing comma in array", () => {
    const { value, complete } = adapter().parse("[1,2,");
    expect(value).toEqual([1, 2]);
    expect(complete).toBe(false);
  });
});

// =============================================================================
// parse() — Edge Cases
// =============================================================================

describe("PartialJsonAdapter.parse — edge cases", () => {
  it("handles whitespace-only input", () => {
    const { value, complete } = adapter().parse("   ");
    expect(value).toBeUndefined();
    expect(complete).toBe(false);
  });

  it("handles malformed JSON gracefully", () => {
    const { value, complete } = adapter().parse("{{{");
    // Should not throw, value undefined means unparseable
    expect(complete).toBe(false);
  });

  it("handles deeply nested structures", () => {
    const { value, complete } = adapter().parse('{"a":{"b":{"c":{"d":1');
    expect(value).toEqual({ a: { b: { c: { d: 1 } } } });
    expect(complete).toBe(false);
  });

  it("handles escaped quotes inside strings", () => {
    const { value, complete } = adapter().parse('{"msg":"say \\"hi\\""}');
    expect(value).toEqual({ msg: 'say "hi"' });
    expect(complete).toBe(true);
  });

  it("handles trailing backslash at escape boundary (R1)", () => {
    // Buffer cut mid-escape: the trailing backslash must be stripped
    // so the appended closing quote isn't interpreted as an escaped quote.
    const { value, complete } = adapter().parse('{"msg":"hello\\');
    expect(value).toEqual({ msg: "hello" });
    expect(complete).toBe(false);
  });

  it("handles partial key (no value yet)", () => {
    // '{"ke' → closes string → '{"ke"}' which is invalid JSON, so value is undefined
    const { value, complete } = adapter().parse('{"ke');
    expect(value).toBeUndefined();
    expect(complete).toBe(false);
  });
});

// =============================================================================
// Accumulator
// =============================================================================

describe("JsonAccumulator", () => {
  it("returns null before any push", () => {
    const acc = adapter().createAccumulator();
    expect(acc.current()).toBeNull();
    expect(acc.isComplete()).toBe(false);
  });

  it("accumulates chunks and returns partial result", () => {
    const acc = adapter().createAccumulator<{ name: string }>();
    acc.push('{"na');
    acc.push('me":');
    acc.push('"Al');
    expect(acc.current()).toEqual({ name: "Al" });
    expect(acc.isComplete()).toBe(false);
  });

  it("detects completion", () => {
    const acc = adapter().createAccumulator<{ x: number }>();
    acc.push('{"x":');
    acc.push("42}");
    expect(acc.current()).toEqual({ x: 42 });
    expect(acc.isComplete()).toBe(true);
  });

  it("reset clears state", () => {
    const acc = adapter().createAccumulator<{ a: number }>();
    acc.push('{"a":1}');
    expect(acc.current()).toEqual({ a: 1 });
    acc.reset();
    expect(acc.current()).toBeNull();
    expect(acc.isComplete()).toBe(false);
  });

  it("handles character-by-character feeding", () => {
    const acc = adapter().createAccumulator<{ v: number }>();
    const json = '{"v":99}';
    for (const ch of json) acc.push(ch);
    expect(acc.current()).toEqual({ v: 99 });
    expect(acc.isComplete()).toBe(true);
  });
});

// =============================================================================
// streamJson — Integration
// =============================================================================

describe("streamJson", () => {
  it("yields partial objects from character stream", async () => {
    const results = await collect(
      streamJson<{ a: number; b: string }>(chars('{"a":1,"b":"hi"}')),
    );
    // Should have at least the final result
    expect(results.length).toBeGreaterThan(0);
    expect(results[results.length - 1]).toEqual({ a: 1, b: "hi" });
  });

  it("yields incremental partial results from chunk stream", async () => {
    const results = await collect(
      streamJson<{ name: string; age: number }>(
        chunks(['{"name":', '"Alice",', '"age":30', "}"]),
      ),
    );
    expect(results.length).toBeGreaterThanOrEqual(2);
    // First partial should have name
    const first = results[0] as Record<string, unknown>;
    expect(first).toHaveProperty("name");
    // Last should be complete
    expect(results[results.length - 1]).toEqual({ name: "Alice", age: 30 });
  });

  it("yields no duplicates for unchanged parses", async () => {
    // Two chunks that don't change the parse result should not duplicate
    const results = await collect(
      streamJson<{ a: number }>(chunks(['{"a":', "1", "}"])),
    );
    // Should deduplicate identical consecutive parses
    const jsonStrings = results.map((r) => JSON.stringify(r));
    for (let i = 1; i < jsonStrings.length; i++) {
      expect(jsonStrings[i]).not.toBe(jsonStrings[i - 1]);
    }
  });

  it("handles empty async iterable", async () => {
    const results = await collect(streamJson(chunks([])));
    expect(results).toEqual([]);
  });

  it("handles complete JSON in single token", async () => {
    const results = await collect(
      streamJson<{ done: boolean }>(chunks(['{"done":true}'])),
    );
    expect(results).toEqual([{ done: true }]);
  });
});
