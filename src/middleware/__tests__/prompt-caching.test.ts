import { describe, it, expect } from "vitest";
import { createPromptCachingMiddleware } from "../prompt-caching.js";
import type { MiddlewareContext, BeforeAgentParams } from "../../ports/middleware.port.js";

function makeCtx(): MiddlewareContext {
  return { sessionId: "test", timestamp: Date.now(), metadata: {} };
}

describe("PromptCaching Middleware", () => {
  it("sets cache metadata on context", () => {
    const mw = createPromptCachingMiddleware({ provider: "anthropic" });
    const ctx = makeCtx();
    const params: BeforeAgentParams = {
      prompt: "hello",
      instructions: "a".repeat(5000), // > 1024 tokens
      tools: {},
    };
    mw.beforeAgent!(ctx, params);
    expect(ctx.metadata["gauss:prompt-cache"]).toBeDefined();
    const cache = ctx.metadata["gauss:prompt-cache"] as { enabled: boolean };
    expect(cache.enabled).toBe(true);
  });

  it("skips caching for short instructions", () => {
    const mw = createPromptCachingMiddleware({ provider: "anthropic" });
    const ctx = makeCtx();
    const params: BeforeAgentParams = {
      prompt: "hello",
      instructions: "short",
      tools: {},
    };
    const result = mw.beforeAgent!(ctx, params);
    // No modifications for short content
    expect(result?.instructions).toBeUndefined();
  });

  it("tracks cache stats from afterAgent", () => {
    const mw = createPromptCachingMiddleware();
    const ctx = makeCtx();
    mw.afterAgent!(ctx, {
      prompt: "hello",
      result: {
        text: "response",
        steps: [],
        sessionId: "test",
        cacheReadInputTokens: 500,
      } as unknown as { text: string; steps: unknown[]; sessionId: string },
    });
    const stats = mw.stats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.tokensRead).toBe(500);
  });

  it("tracks cache creation tokens", () => {
    const mw = createPromptCachingMiddleware();
    const ctx = makeCtx();
    mw.afterAgent!(ctx, {
      prompt: "hello",
      result: {
        text: "response",
        steps: [],
        sessionId: "test",
        cacheCreationInputTokens: 1000,
      } as unknown as { text: string; steps: unknown[]; sessionId: string },
    });
    const stats = mw.stats();
    expect(stats.cacheMisses).toBe(1);
    expect(stats.tokensCreated).toBe(1000);
  });
});
