/**
 * Edge case and property-based tests for DX utilities.
 * Uses fast-check for property-based testing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("gauss-napi", () => ({
  version: vi.fn(() => "1.0.0-test"),
  create_provider: vi.fn(() => 42),
  destroy_provider: vi.fn(),
  agent_run: vi.fn(async () => ({
    text: '{"result":"ok"}',
    steps: 1,
    inputTokens: 10,
    outputTokens: 20,
  })),
  agent_run_with_tool_executor: vi.fn(async () => ({
    text: "ok",
    steps: 1,
    inputTokens: 5,
    outputTokens: 5,
  })),
  agent_stream_with_tool_executor: vi.fn(async () => ({
    text: "ok",
    steps: 1,
    inputTokens: 5,
    outputTokens: 5,
  })),
  generate: vi.fn(async () => ({ text: "raw" })),
  generate_with_tools: vi.fn(async () => ({ text: "tool" })),
}));

import { Agent } from "../agent.js";
import { batch } from "../batch.js";
import { withRetry, retryable } from "../retry.js";
import { structured } from "../structured.js";
import { template } from "../template.js";
import { pipe, mapAsync, filterAsync, reduceAsync, tapAsync, compose } from "../pipeline.js";
import { agent_run } from "gauss-napi";

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// RETRY EDGE CASES
// ═══════════════════════════════════════════════════════════════════

describe("retry edge cases", () => {
  it("maxRetries=0 means no retries, only one attempt", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(withRetry(fn, { maxRetries: 0, baseDelayMs: 1 })).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("handles non-Error thrown values", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce("string error")
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });

  it("handles undefined thrown values", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });

  it("exponential backoff caps at maxDelayMs", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const start = Date.now();
    await expect(
      withRetry(fn, {
        maxRetries: 3,
        backoff: "exponential",
        baseDelayMs: 1,
        maxDelayMs: 5,
        jitter: 0,
        onRetry: (_, __, delayMs) => delays.push(delayMs),
      })
    ).rejects.toThrow("fail");
    for (const d of delays) {
      expect(d).toBeLessThanOrEqual(5);
    }
  });

  it("linear backoff scales linearly", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(
      withRetry(fn, {
        maxRetries: 3,
        backoff: "linear",
        baseDelayMs: 10,
        maxDelayMs: 50000,
        jitter: 0,
        onRetry: (_, __, delayMs) => delays.push(delayMs),
      })
    ).rejects.toThrow();
    expect(delays[0]).toBe(10);
    expect(delays[1]).toBe(20);
    expect(delays[2]).toBe(30);
  });

  it("fixed backoff is constant", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(
      withRetry(fn, {
        maxRetries: 3,
        backoff: "fixed",
        baseDelayMs: 10,
        jitter: 0,
        onRetry: (_, __, delayMs) => delays.push(delayMs),
      })
    ).rejects.toThrow();
    expect(delays.every(d => d === 10)).toBe(true);
  });

  it("retryIf returning false stops immediately", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("stop"));
    await expect(
      withRetry(fn, { maxRetries: 10, baseDelayMs: 1, retryIf: () => false })
    ).rejects.toThrow("stop");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("onRetry receives correct attempt numbers", async () => {
    const attempts: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        onRetry: (_, attempt) => attempts.push(attempt),
      })
    ).rejects.toThrow();
    expect(attempts).toEqual([1, 2, 3]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STRUCTURED OUTPUT EDGE CASES
// ═══════════════════════════════════════════════════════════════════

describe("structured edge cases", () => {
  it("handles deeply nested JSON", async () => {
    vi.mocked(agent_run).mockResolvedValueOnce({
      text: '{"a":{"b":{"c":{"d":42}}}}',
      steps: 1, inputTokens: 5, outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<any>(agent, "test", {
      schema: { type: "object" },
    });
    expect(data.a.b.c.d).toBe(42);
    agent.destroy();
  });

  it("handles JSON with escaped quotes", async () => {
    vi.mocked(agent_run).mockResolvedValueOnce({
      text: '{"msg":"He said \\"hello\\""}',
      steps: 1, inputTokens: 5, outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<any>(agent, "test", {
      schema: { type: "object" },
    });
    expect(data.msg).toBe('He said "hello"');
    agent.destroy();
  });

  it("handles JSON arrays at top level", async () => {
    vi.mocked(agent_run).mockResolvedValueOnce({
      text: 'Here are the results: [1, 2, 3]',
      steps: 1, inputTokens: 5, outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<number[]>(agent, "test", {
      schema: { type: "array", items: { type: "number" } },
    });
    expect(data).toEqual([1, 2, 3]);
    agent.destroy();
  });

  it("handles JSON with unicode", async () => {
    vi.mocked(agent_run).mockResolvedValueOnce({
      text: '{"emoji":"🎉","kanji":"日本語"}',
      steps: 1, inputTokens: 5, outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<any>(agent, "test", {
      schema: { type: "object" },
    });
    expect(data.emoji).toBe("🎉");
    expect(data.kanji).toBe("日本語");
    agent.destroy();
  });

  it("handles JSON embedded in verbose text", async () => {
    vi.mocked(agent_run).mockResolvedValueOnce({
      text: `Sure! Here is the JSON you requested:\n\n{"name":"Alice","age":30}\n\nLet me know if you need anything else!`,
      steps: 1, inputTokens: 5, outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<any>(agent, "test", {
      schema: { type: "object" },
    });
    expect(data.name).toBe("Alice");
    expect(data.age).toBe(30);
    agent.destroy();
  });

  it("maxParseRetries=0 means only one attempt", async () => {
    vi.mocked(agent_run).mockResolvedValue({
      text: "not json", steps: 1, inputTokens: 5, outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    await expect(
      structured(agent, "test", { schema: { type: "object" }, maxParseRetries: 0 })
    ).rejects.toThrow("Failed to extract structured output after 1 attempts");
    agent.destroy();
  });

  it("handles empty object", async () => {
    vi.mocked(agent_run).mockResolvedValueOnce({
      text: "{}",
      steps: 1, inputTokens: 5, outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<any>(agent, "test", {
      schema: { type: "object" },
    });
    expect(data).toEqual({});
    agent.destroy();
  });

  it("handles JSON with newlines in strings", async () => {
    vi.mocked(agent_run).mockResolvedValueOnce({
      text: '{"text":"line1\\nline2\\nline3"}',
      steps: 1, inputTokens: 5, outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<any>(agent, "test", {
      schema: { type: "object" },
    });
    expect(data.text).toBe("line1\nline2\nline3");
    agent.destroy();
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE EDGE CASES
// ═══════════════════════════════════════════════════════════════════

describe("template edge cases", () => {
  it("handles empty template", () => {
    const t = template("");
    expect(t({})).toBe("");
    expect(t.variables).toEqual([]);
  });

  it("handles template with no variables", () => {
    const t = template("Just plain text");
    expect(t({})).toBe("Just plain text");
  });

  it("handles variable at start", () => {
    const t = template("{{greeting}} world");
    expect(t({ greeting: "Hello" })).toBe("Hello world");
  });

  it("handles variable at end", () => {
    const t = template("Hello {{name}}");
    expect(t({ name: "world" })).toBe("Hello world");
  });

  it("handles adjacent variables", () => {
    const t = template("{{a}}{{b}}{{c}}");
    expect(t({ a: "1", b: "2", c: "3" })).toBe("123");
  });

  it("ignores malformed variable syntax", () => {
    const t = template("{{good}} {bad} {{ spaced }} {{}}");
    expect(t.variables).toEqual(["good"]);
  });

  it("handles values containing template syntax", () => {
    const t = template("Output: {{text}}");
    expect(t({ text: "{{not_a_var}}" })).toBe("Output: {{not_a_var}}");
  });

  it("handles multiline templates", () => {
    const t = template("Line 1: {{a}}\nLine 2: {{b}}\nLine 3: {{c}}");
    expect(t({ a: "A", b: "B", c: "C" })).toBe("Line 1: A\nLine 2: B\nLine 3: C");
  });

  it("handles special regex chars in values", () => {
    const t = template("Pattern: {{regex}}");
    expect(t({ regex: "a.*b+c?" })).toBe("Pattern: a.*b+c?");
  });
});

// ═══════════════════════════════════════════════════════════════════
// PIPELINE EDGE CASES
// ═══════════════════════════════════════════════════════════════════

describe("pipeline edge cases", () => {
  it("pipe with single identity step", async () => {
    const result = await pipe(42, (n: number) => n);
    expect(result).toBe(42);
  });

  it("pipe propagates errors", async () => {
    await expect(
      pipe("hello", async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");
  });

  it("mapAsync with empty array", async () => {
    const result = await mapAsync([], async (n: number) => n * 2);
    expect(result).toEqual([]);
  });

  it("mapAsync with single item", async () => {
    const result = await mapAsync([42], async (n) => n * 2);
    expect(result).toEqual([84]);
  });

  it("mapAsync concurrency=1 processes sequentially", async () => {
    const order: number[] = [];
    await mapAsync(
      [1, 2, 3],
      async (n) => {
        order.push(n);
        await new Promise(r => setTimeout(r, 1));
        return n;
      },
      { concurrency: 1 },
    );
    expect(order).toEqual([1, 2, 3]);
  });

  it("filterAsync with all items matching", async () => {
    const result = await filterAsync([1, 2, 3], async () => true);
    expect(result).toEqual([1, 2, 3]);
  });

  it("filterAsync with no items matching", async () => {
    const result = await filterAsync([1, 2, 3], async () => false);
    expect(result).toEqual([]);
  });

  it("reduceAsync with empty array returns initial", async () => {
    const result = await reduceAsync([], async (acc: number, n: number) => acc + n, 42);
    expect(result).toBe(42);
  });

  it("tapAsync with empty array", async () => {
    const result = await tapAsync([], async () => {});
    expect(result).toEqual([]);
  });

  it("compose with no functions returns identity", async () => {
    const fn = compose<number>();
    expect(await fn(42)).toBe(42);
  });

  it("mapAsync propagates errors", async () => {
    await expect(
      mapAsync([1, 2, 3], async (n) => {
        if (n === 2) throw new Error("fail at 2");
        return n;
      })
    ).rejects.toThrow("fail at 2");
  });
});

// ═══════════════════════════════════════════════════════════════════
// BATCH EDGE CASES
// ═══════════════════════════════════════════════════════════════════

describe("batch edge cases", () => {
  it("batch with empty array", async () => {
    const result = await batch([]);
    expect(result).toEqual([]);
  });

  it("batch with single item", async () => {
    const result = await batch(["hello"], { providerOptions: { apiKey: "k" } });
    expect(result).toHaveLength(1);
    expect(result[0].result?.text).toBeDefined();
  });

  it("batch concurrency=1", async () => {
    const result = await batch(
      ["a", "b"],
      { concurrency: 1, providerOptions: { apiKey: "k" } },
    );
    expect(result).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PROPERTY-BASED TESTS (fast-check)
// ═══════════════════════════════════════════════════════════════════

describe("property-based: template", () => {
  it("rendered output never contains unsubstituted {{var}}", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/), { minLength: 1, maxLength: 5 }),
        fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        (varNames, values) => {
          const uniqueVars = [...new Set(varNames)];
          if (uniqueVars.length === 0) return;
          const tpl = uniqueVars.map(v => `{{${v}}}`).join(" ");
          const t = template(tpl);
          const vals: Record<string, string> = {};
          uniqueVars.forEach((v, i) => { vals[v] = values[i % values.length] ?? ""; });
          const result = t(vals);
          for (const v of uniqueVars) {
            expect(result).not.toContain(`{{${v}}}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("variables property matches actual variables in template", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]\w{0,7}$/), { minLength: 0, maxLength: 10 }),
        (vars) => {
          const uniqueVars = [...new Set(vars)];
          const tpl = uniqueVars.map(v => `pre {{${v}}} post`).join("\n");
          const t = template(tpl);
          expect(t.variables).toEqual(uniqueVars);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("property-based: pipeline", () => {
  it("pipe preserves identity: pipe(x) === x", () => {
    fc.assert(
      fc.asyncProperty(
        fc.anything(),
        async (value) => {
          const result = await pipe(value);
          expect(result).toEqual(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("mapAsync preserves length", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer()),
        async (arr) => {
          const result = await mapAsync(arr, async (n) => n * 2);
          expect(result.length).toBe(arr.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("filterAsync result is subset of input", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer()),
        async (arr) => {
          const result = await filterAsync(arr, async (n) => n > 0);
          for (const item of result) {
            expect(arr).toContain(item);
            expect(item).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("reduceAsync sum matches sync reduce", () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: -1000, max: 1000 })),
        async (arr) => {
          const asyncResult = await reduceAsync(arr, async (acc, n) => acc + n, 0);
          const syncResult = arr.reduce((a, b) => a + b, 0);
          expect(asyncResult).toBe(syncResult);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("compose(f, g)(x) === g(f(x))", () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -1000, max: 1000 }),
        async (n) => {
          const f = async (x: number) => x * 2;
          const g = async (x: number) => x + 1;
          const composed = compose(f, g);
          const manual = await g(await f(n));
          expect(await composed(n)).toBe(manual);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("property-based: retry", () => {
  it("always calls fn at least once", () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        async (maxRetries) => {
          let callCount = 0;
          try {
            await withRetry(
              async () => { callCount++; throw new Error("fail"); },
              { maxRetries, baseDelayMs: 1, jitter: 0 },
            );
          } catch {
            // expected
          }
          expect(callCount).toBeGreaterThanOrEqual(1);
          expect(callCount).toBeLessThanOrEqual(maxRetries + 1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("succeeds immediately if fn never throws", () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        fc.string(),
        async (maxRetries, value) => {
          const result = await withRetry(async () => value, { maxRetries, baseDelayMs: 1 });
          expect(result).toBe(value);
        }
      ),
      { numRuns: 50 }
    );
  });
});
