/**
 * Tests for DX features: retry, structured output, prompt templates.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("gauss-napi", () => ({
  version: vi.fn(() => "1.0.0-test"),
  create_provider: vi.fn(() => 42),
  destroy_provider: vi.fn(),
  agent_run: vi.fn(async () => ({
    text: '{"fruits":["apple","banana","cherry"]}',
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
import { withRetry, retryable } from "../retry.js";
import { structured } from "../structured.js";
import { template, summarize, translate, codeReview, classify, extract } from "../template.js";
import { agent_run } from "gauss-napi";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Retry ─────────────────────────────────────────────────────────

describe("withRetry", () => {
  it("succeeds on first try", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries on failure and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValueOnce("ok");

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      backoff: "fixed",
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after max retries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fail"));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })
    ).rejects.toThrow("always fail");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("respects retryIf predicate", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("retryable"))
      .mockRejectedValueOnce(new Error("not retryable"));

    await expect(
      withRetry(fn, {
        maxRetries: 5,
        baseDelayMs: 1,
        retryIf: (err) => err.message === "retryable",
      })
    ).rejects.toThrow("not retryable");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("ok");

    await withRetry(fn, { maxRetries: 1, baseDelayMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });
});

describe("retryable", () => {
  it("wraps agent.run with retry", async () => {
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const run = retryable(agent, { maxRetries: 1, baseDelayMs: 1 });
    const result = await run("Hello");
    expect(result.text).toBeDefined();
    agent.destroy();
  });
});

// ─── Structured Output ─────────────────────────────────────────────

describe("structured", () => {
  it("extracts JSON from agent response", async () => {
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured(agent, "List fruits", {
      schema: {
        type: "object",
        properties: { fruits: { type: "array", items: { type: "string" } } },
      },
    });
    expect(data).toEqual({ fruits: ["apple", "banana", "cherry"] });
    agent.destroy();
  });

  it("handles markdown code blocks", async () => {
    vi.mocked(agent_run).mockResolvedValueOnce({
      text: "Here you go:\n```json\n{\"name\":\"Alice\"}\n```",
      steps: 1,
      inputTokens: 5,
      outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<{ name: string }>(agent, "Who?", {
      schema: { type: "object", properties: { name: { type: "string" } } },
    });
    expect(data.name).toBe("Alice");
    agent.destroy();
  });

  it("includes raw result when requested", async () => {
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const result = await structured(agent, "List fruits", {
      schema: { type: "object" },
      includeRaw: true,
    });
    expect(result.raw).toBeDefined();
    expect(result.raw?.text).toBeDefined();
    agent.destroy();
  });

  it("retries on parse failure", async () => {
    vi.mocked(agent_run)
      .mockResolvedValueOnce({
        text: "not json at all",
        steps: 1,
        inputTokens: 5,
        outputTokens: 10,
      })
      .mockResolvedValueOnce({
        text: '{"valid":true}',
        steps: 1,
        inputTokens: 5,
        outputTokens: 10,
      });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const { data } = await structured<{ valid: boolean }>(agent, "test", {
      schema: { type: "object" },
      maxParseRetries: 2,
    });
    expect(data.valid).toBe(true);
    agent.destroy();
  });

  it("throws after max parse retries", async () => {
    vi.mocked(agent_run).mockResolvedValue({
      text: "never valid json!!!",
      steps: 1,
      inputTokens: 5,
      outputTokens: 10,
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    await expect(
      structured(agent, "test", { schema: { type: "object" }, maxParseRetries: 1 })
    ).rejects.toThrow("Failed to extract structured output");
    agent.destroy();
  });
});

// ─── Prompt Templates ──────────────────────────────────────────────

describe("template", () => {
  it("creates a template with variables", () => {
    const t = template("Hello {{name}}, age {{age}}");
    expect(t.variables).toEqual(["name", "age"]);
    expect(t.raw).toBe("Hello {{name}}, age {{age}}");
  });

  it("renders variables correctly", () => {
    const t = template("Hello {{name}}!");
    expect(t({ name: "World" })).toBe("Hello World!");
  });

  it("throws on missing variable", () => {
    const t = template("Hello {{name}}!");
    expect(() => (t as any)({})).toThrow("Missing template variable: {{name}}");
  });

  it("handles multiple occurrences of same variable", () => {
    const t = template("{{x}} + {{x}} = 2*{{x}}");
    expect(t({ x: "5" })).toBe("5 + 5 = 2*5");
    expect(t.variables).toEqual(["x"]);
  });

  it("composable templates", () => {
    const inner = template("Hello {{name}}");
    const outer = template("{{greeting}}, welcome!");
    const result = outer({ greeting: inner({ name: "Alice" }) });
    expect(result).toBe("Hello Alice, welcome!");
  });
});

describe("built-in templates", () => {
  it("summarize has correct variables", () => {
    expect(summarize.variables).toEqual(["format", "style", "text"]);
  });

  it("translate renders correctly", () => {
    const result = translate({ language: "French", text: "Hello" });
    expect(result).toContain("French");
    expect(result).toContain("Hello");
  });

  it("codeReview renders correctly", () => {
    const result = codeReview({ language: "typescript", code: "const x = 1;" });
    expect(result).toContain("typescript");
    expect(result).toContain("const x = 1;");
  });

  it("classify renders correctly", () => {
    const result = classify({ categories: "spam, ham", text: "Buy now!" });
    expect(result).toContain("spam, ham");
    expect(result).toContain("Buy now!");
  });

  it("extract renders correctly", () => {
    const result = extract({ fields: "name, email", text: "I'm John" });
    expect(result).toContain("name, email");
    expect(result).toContain("John");
  });
});
