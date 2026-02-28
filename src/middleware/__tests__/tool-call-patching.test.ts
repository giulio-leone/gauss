import { describe, it, expect } from "vitest";
import { createToolCallPatchingMiddleware } from "../tool-call-patching.js";
import type { MiddlewareContext, BeforeToolCallParams, AfterToolCallParams } from "../../ports/middleware.port.js";

function makeCtx(): MiddlewareContext {
  return { sessionId: "test", timestamp: Date.now(), metadata: {} };
}

describe("ToolCallPatching Middleware", () => {
  it("parses stringified JSON args", () => {
    const mw = createToolCallPatchingMiddleware();
    const ctx = makeCtx();
    const result = mw.beforeTool!(ctx, {
      toolName: "search",
      args: '{"query": "hello"}',
      stepIndex: 0,
    });
    expect(result?.args).toEqual({ query: "hello" });
    expect(mw.stats().argsParsed).toBe(1);
  });

  it("coerces string numbers to actual numbers", () => {
    const mw = createToolCallPatchingMiddleware({ coerceTypes: true });
    const ctx = makeCtx();
    const result = mw.beforeTool!(ctx, {
      toolName: "calc",
      args: { x: "42", y: "3.14", name: "test" },
      stepIndex: 0,
    });
    expect(result?.args).toEqual({ x: 42, y: 3.14, name: "test" });
  });

  it("coerces string booleans", () => {
    const mw = createToolCallPatchingMiddleware({ coerceTypes: true });
    const ctx = makeCtx();
    const result = mw.beforeTool!(ctx, {
      toolName: "toggle",
      args: { enabled: "true", verbose: "false" },
      stepIndex: 0,
    });
    expect(result?.args).toEqual({ enabled: true, verbose: false });
  });

  it("strips null args when enabled", () => {
    const mw = createToolCallPatchingMiddleware({
      stripNullArgs: true,
      coerceTypes: false,
    });
    const ctx = makeCtx();
    const result = mw.beforeTool!(ctx, {
      toolName: "test",
      args: { a: 1, b: null, c: undefined, d: "ok" },
      stepIndex: 0,
    });
    expect(result?.args).toEqual({ a: 1, d: "ok" });
    expect(mw.stats().nullsStripped).toBe(1);
  });

  it("applies alias map", () => {
    const mw = createToolCallPatchingMiddleware({
      aliasMap: { get_weather: "weather_lookup" },
      coerceTypes: false,
    });
    const ctx = makeCtx();
    mw.beforeTool!(ctx, {
      toolName: "get_weather",
      args: { city: "Rome" },
      stepIndex: 0,
    });
    expect(mw.stats().aliasesApplied).toBe(1);
  });

  it("normalizes Google-style function responses", () => {
    const mw = createToolCallPatchingMiddleware();
    const ctx = makeCtx();
    const result = mw.afterTool!(ctx, {
      toolName: "search",
      args: {},
      result: { functionResponse: { response: { items: [1, 2, 3] } } },
      stepIndex: 0,
      durationMs: 50,
    });
    expect(result?.result).toEqual({ items: [1, 2, 3] });
    expect(mw.stats().resultsNormalized).toBe(1);
  });

  it("normalizes wrapped output", () => {
    const mw = createToolCallPatchingMiddleware();
    const ctx = makeCtx();
    const result = mw.afterTool!(ctx, {
      toolName: "test",
      args: {},
      result: { output: "hello" },
      stepIndex: 0,
      durationMs: 10,
    });
    expect(result?.result).toBe("hello");
  });

  it("leaves valid args unchanged", () => {
    const mw = createToolCallPatchingMiddleware({ coerceTypes: false });
    const ctx = makeCtx();
    const result = mw.beforeTool!(ctx, {
      toolName: "test",
      args: { name: "test", count: 5 },
      stepIndex: 0,
    });
    expect(result).toBeUndefined(); // no modification needed
  });
});
