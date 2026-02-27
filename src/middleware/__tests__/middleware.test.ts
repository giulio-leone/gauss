import { describe, it, expect, vi } from "vitest";
import { MiddlewareChain, composeMiddleware } from "../chain.js";
import { createLoggingMiddleware } from "../logging.js";
import { createCachingMiddleware } from "../caching.js";
import { createHITLMiddleware } from "../hitl.js";
import { createProcessorPipeline } from "../processor.js";
import { MiddlewarePriority } from "../../ports/middleware.port.js";
import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeAgentParams,
} from "../../ports/middleware.port.js";

// =============================================================================
// Helpers
// =============================================================================

function makeCtx(overrides: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    sessionId: "test-session",
    agentName: "test-agent",
    timestamp: Date.now(),
    metadata: {},
    ...overrides,
  };
}

function makeBeforeAgentParams(overrides: Partial<BeforeAgentParams> = {}): BeforeAgentParams {
  return {
    prompt: "Hello",
    instructions: "Be helpful",
    tools: {},
    ...overrides,
  };
}

function createTestMiddleware(
  name: string,
  priority: MiddlewarePriority = MiddlewarePriority.NORMAL,
  hooks: Partial<MiddlewarePort> = {},
): MiddlewarePort {
  return { name, priority, ...hooks };
}

// =============================================================================
// MiddlewareChain
// =============================================================================

describe("MiddlewareChain", () => {
  describe("registration", () => {
    it("should register and list middleware", () => {
      const chain = new MiddlewareChain();
      const mw = createTestMiddleware("test-mw");
      chain.use(mw);
      expect(chain.list()).toHaveLength(1);
      expect(chain.list()[0].name).toBe("test-mw");
    });

    it("should reject duplicate names", () => {
      const chain = new MiddlewareChain();
      chain.use(createTestMiddleware("dup"));
      expect(() => chain.use(createTestMiddleware("dup"))).toThrow("already registered");
    });

    it("should remove middleware by name", () => {
      const chain = new MiddlewareChain();
      chain.use(createTestMiddleware("a"));
      chain.use(createTestMiddleware("b"));
      expect(chain.remove("a")).toBe(true);
      expect(chain.list()).toHaveLength(1);
      expect(chain.remove("nonexistent")).toBe(false);
    });
  });

  describe("priority ordering", () => {
    it("should execute in priority order (FIRST → LAST)", async () => {
      const chain = new MiddlewareChain();
      const order: string[] = [];

      chain.use(createTestMiddleware("late", MiddlewarePriority.LATE, {
        beforeAgent: () => { order.push("late"); },
      }));
      chain.use(createTestMiddleware("first", MiddlewarePriority.FIRST, {
        beforeAgent: () => { order.push("first"); },
      }));
      chain.use(createTestMiddleware("normal", MiddlewarePriority.NORMAL, {
        beforeAgent: () => { order.push("normal"); },
      }));

      await chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams());
      expect(order).toEqual(["first", "normal", "late"]);
    });
  });

  describe("beforeAgent", () => {
    it("should accumulate prompt mutations", async () => {
      const chain = new MiddlewareChain();
      chain.use(createTestMiddleware("a", MiddlewarePriority.FIRST, {
        beforeAgent: () => ({ prompt: "Modified A" }),
      }));
      chain.use(createTestMiddleware("b", MiddlewarePriority.NORMAL, {
        beforeAgent: (_ctx, params) => ({ prompt: params.prompt + " + B" }),
      }));

      const result = await chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams());
      expect(result.prompt).toBe("Modified A + B");
    });

    it("should handle abort (short-circuit)", async () => {
      const chain = new MiddlewareChain();
      const afterAbort = vi.fn();

      chain.use(createTestMiddleware("aborter", MiddlewarePriority.FIRST, {
        beforeAgent: () => ({ abort: true, earlyResult: "Aborted!" }),
      }));
      chain.use(createTestMiddleware("after", MiddlewarePriority.NORMAL, {
        beforeAgent: afterAbort,
      }));

      const result = await chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams());
      expect(result.aborted).toBe(true);
      expect(result.earlyResult).toBe("Aborted!");
    });

    it("should merge additional tools", async () => {
      const chain = new MiddlewareChain();
      const mockTool = { description: "test" } as unknown;

      chain.use(createTestMiddleware("tool-injector", MiddlewarePriority.NORMAL, {
        beforeAgent: () => ({ tools: { myTool: mockTool } as unknown as Record<string, never> }),
      }));

      const result = await chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams());
      expect(result.tools).toHaveProperty("myTool");
    });
  });

  describe("afterAgent", () => {
    it("should execute in reverse priority order", async () => {
      const chain = new MiddlewareChain();
      const order: string[] = [];

      chain.use(createTestMiddleware("first", MiddlewarePriority.FIRST, {
        afterAgent: () => { order.push("first"); },
      }));
      chain.use(createTestMiddleware("last", MiddlewarePriority.LAST, {
        afterAgent: () => { order.push("last"); },
      }));

      await chain.runAfterAgent(makeCtx(), {
        prompt: "test",
        result: { text: "ok", steps: [], sessionId: "s" },
      });

      expect(order).toEqual(["last", "first"]);
    });

    it("should mutate result text", async () => {
      const chain = new MiddlewareChain();
      chain.use(createTestMiddleware("appender", MiddlewarePriority.NORMAL, {
        afterAgent: (_ctx, params) => ({ text: params.result.text + " [modified]" }),
      }));

      const result = await chain.runAfterAgent(makeCtx(), {
        prompt: "test",
        result: { text: "original", steps: [], sessionId: "s" },
      });

      expect(result.result.text).toBe("original [modified]");
    });
  });

  describe("beforeTool", () => {
    it("should allow arg modification", async () => {
      const chain = new MiddlewareChain();
      chain.use(createTestMiddleware("modifier", MiddlewarePriority.NORMAL, {
        beforeTool: () => ({ args: { modified: true } }),
      }));

      const result = await chain.runBeforeTool(makeCtx(), {
        toolName: "test",
        args: { original: true },
        stepIndex: 0,
      });

      expect(result.args).toEqual({ modified: true });
    });

    it("should support skip (mock result)", async () => {
      const chain = new MiddlewareChain();
      chain.use(createTestMiddleware("skipper", MiddlewarePriority.NORMAL, {
        beforeTool: () => ({ skip: true, mockResult: "mocked" }),
      }));

      const result = await chain.runBeforeTool(makeCtx(), {
        toolName: "test",
        args: {},
        stepIndex: 0,
      });

      expect(result.skip).toBe(true);
      expect(result.mockResult).toBe("mocked");
    });
  });

  describe("afterTool", () => {
    it("should allow result modification in reverse order", async () => {
      const chain = new MiddlewareChain();
      chain.use(createTestMiddleware("a", MiddlewarePriority.FIRST, {
        afterTool: (_ctx, params) => ({ result: `${params.result}-a` }),
      }));
      chain.use(createTestMiddleware("b", MiddlewarePriority.LAST, {
        afterTool: (_ctx, params) => ({ result: `${params.result}-b` }),
      }));

      const result = await chain.runAfterTool(makeCtx(), {
        toolName: "test",
        args: {},
        result: "original",
        stepIndex: 0,
        durationMs: 10,
      });

      // Reverse order: LAST first, then FIRST
      expect(result.result).toBe("original-b-a");
    });
  });

  describe("error isolation", () => {
    it("should continue chain when a middleware throws and onError suppresses", async () => {
      const chain = new MiddlewareChain();
      const order: string[] = [];

      chain.use(createTestMiddleware("error-handler", MiddlewarePriority.FIRST, {
        onError: () => ({ suppress: true }),
      }));

      chain.use(createTestMiddleware("thrower", MiddlewarePriority.NORMAL, {
        beforeAgent: () => { throw new Error("boom"); },
      }));

      chain.use(createTestMiddleware("after-throw", MiddlewarePriority.LATE, {
        beforeAgent: () => { order.push("after-throw"); },
      }));

      await chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams());
      expect(order).toContain("after-throw");
    });

    it("should rethrow when error is not suppressed", async () => {
      const chain = new MiddlewareChain();
      chain.use(createTestMiddleware("thrower", MiddlewarePriority.NORMAL, {
        beforeAgent: () => { throw new Error("unhandled"); },
      }));

      await expect(
        chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams()),
      ).rejects.toThrow("unhandled");
    });
  });

  describe("setup / teardown", () => {
    it("should call setup in order and teardown in reverse", async () => {
      const chain = new MiddlewareChain();
      const order: string[] = [];

      chain.use(createTestMiddleware("a", MiddlewarePriority.FIRST, {
        setup: () => { order.push("setup-a"); },
        teardown: () => { order.push("teardown-a"); },
      }));
      chain.use(createTestMiddleware("b", MiddlewarePriority.LAST, {
        setup: () => { order.push("setup-b"); },
        teardown: () => { order.push("teardown-b"); },
      }));

      const ctx = makeCtx();
      await chain.setup(ctx);
      await chain.teardown(ctx);

      expect(order).toEqual(["setup-a", "setup-b", "teardown-b", "teardown-a"]);
    });
  });
});

// =============================================================================
// composeMiddleware
// =============================================================================

describe("composeMiddleware", () => {
  it("should compose multiple middleware into one", async () => {
    const order: string[] = [];
    const composed = composeMiddleware(
      "composed",
      createTestMiddleware("a", MiddlewarePriority.FIRST, {
        beforeAgent: () => { order.push("a"); return { prompt: "from-a" }; },
      }),
      createTestMiddleware("b", MiddlewarePriority.NORMAL, {
        beforeAgent: (_ctx, params) => { order.push("b"); return { prompt: params.prompt + "+b" }; },
      }),
    );

    const chain = new MiddlewareChain();
    chain.use(composed);

    const result = await chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams());
    expect(order).toEqual(["a", "b"]);
    expect(result.prompt).toBe("from-a+b");
  });
});

// =============================================================================
// LoggingMiddleware
// =============================================================================

describe("LoggingMiddleware", () => {
  it("should log agent start and complete events", async () => {
    const logs: unknown[] = [];
    const logging = createLoggingMiddleware({
      logger: (entry) => logs.push(entry),
    });

    const chain = new MiddlewareChain();
    chain.use(logging);

    const ctx = makeCtx();
    await chain.runBeforeAgent(ctx, makeBeforeAgentParams());
    await chain.runAfterAgent(ctx, {
      prompt: "test",
      result: { text: "done", steps: [{}], sessionId: "s" },
    });

    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ event: "agent:start" });
    expect(logs[1]).toMatchObject({ event: "agent:complete" });
  });

  it("should log tool events", async () => {
    const logs: unknown[] = [];
    const logging = createLoggingMiddleware({
      logger: (entry) => logs.push(entry),
      logToolArgs: true,
    });

    const chain = new MiddlewareChain();
    chain.use(logging);

    const ctx = makeCtx();
    await chain.runBeforeTool(ctx, { toolName: "myTool", args: { x: 1 }, stepIndex: 0 });
    await chain.runAfterTool(ctx, {
      toolName: "myTool", args: { x: 1 }, result: "ok", stepIndex: 0, durationMs: 5,
    });

    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ event: "tool:start" });
    expect(logs[1]).toMatchObject({ event: "tool:complete" });
  });
});

// =============================================================================
// CachingMiddleware
// =============================================================================

describe("CachingMiddleware", () => {
  it("should cache tool results and serve from cache", async () => {
    const caching = createCachingMiddleware({ ttlMs: 60_000 });
    const chain = new MiddlewareChain();
    chain.use(caching);

    const ctx = makeCtx();
    const toolParams = { toolName: "search", args: { q: "hello" }, stepIndex: 0 };

    // First call — miss
    const before1 = await chain.runBeforeTool(ctx, toolParams);
    expect(before1.skip).toBeUndefined();

    // Simulate tool execution and afterTool
    await chain.runAfterTool(ctx, {
      ...toolParams, result: "cached-result", durationMs: 100,
    });

    // Second call — hit
    const before2 = await chain.runBeforeTool(ctx, toolParams);
    expect(before2.skip).toBe(true);
    expect(before2.mockResult).toBe("cached-result");

    expect(caching.stats().hits).toBe(1);
    expect(caching.stats().misses).toBe(1);
  });

  it("should respect TTL expiry", async () => {
    const caching = createCachingMiddleware({ ttlMs: 1 });
    const chain = new MiddlewareChain();
    chain.use(caching);

    const ctx = makeCtx();
    const toolParams = { toolName: "test", args: {}, stepIndex: 0 };

    await chain.runBeforeTool(ctx, toolParams);
    await chain.runAfterTool(ctx, { ...toolParams, result: "value", durationMs: 1 });

    // Wait for TTL
    await new Promise((r) => setTimeout(r, 10));

    const before = await chain.runBeforeTool(ctx, toolParams);
    expect(before.skip).toBeUndefined();
  });

  it("should exclude specified tools", async () => {
    const caching = createCachingMiddleware({ excludeTools: ["noCache"] });
    const chain = new MiddlewareChain();
    chain.use(caching);

    const ctx = makeCtx();
    await chain.runBeforeTool(ctx, { toolName: "noCache", args: {}, stepIndex: 0 });
    await chain.runAfterTool(ctx, {
      toolName: "noCache", args: {}, result: "v", stepIndex: 0, durationMs: 1,
    });

    const before = await chain.runBeforeTool(ctx, { toolName: "noCache", args: {}, stepIndex: 0 });
    expect(before.skip).toBeUndefined();
  });

  it("should invalidate cache", () => {
    const caching = createCachingMiddleware();
    caching.invalidate();
    expect(caching.stats().size).toBe(0);
  });
});

// =============================================================================
// HITLMiddleware
// =============================================================================

describe("HITLMiddleware", () => {
  it("should approve tool calls", async () => {
    const hitl = createHITLMiddleware({
      approvalHandler: async () => ({ action: "approve" }),
    });

    const chain = new MiddlewareChain();
    chain.use(hitl);

    const result = await chain.runBeforeTool(makeCtx(), {
      toolName: "dangerous", args: { x: 1 }, stepIndex: 0,
    });

    expect(result.skip).toBeUndefined();
  });

  it("should reject tool calls", async () => {
    const hitl = createHITLMiddleware({
      approvalHandler: async () => ({ action: "reject", reason: "Nope" }),
    });

    const chain = new MiddlewareChain();
    chain.use(hitl);

    const result = await chain.runBeforeTool(makeCtx(), {
      toolName: "dangerous", args: {}, stepIndex: 0,
    });

    expect(result.skip).toBe(true);
    expect(result.mockResult).toMatchObject({ error: expect.stringContaining("Nope") });
  });

  it("should edit tool args", async () => {
    const hitl = createHITLMiddleware({
      approvalHandler: async () => ({ action: "edit", args: { modified: true } }),
    });

    const chain = new MiddlewareChain();
    chain.use(hitl);

    const result = await chain.runBeforeTool(makeCtx(), {
      toolName: "test", args: { original: true }, stepIndex: 0,
    });

    expect(result.args).toEqual({ modified: true });
  });

  it("should skip approval for alwaysAllow tools", async () => {
    const handler = vi.fn();
    const hitl = createHITLMiddleware({
      approvalHandler: handler,
      alwaysAllow: ["safe-tool"],
    });

    const chain = new MiddlewareChain();
    chain.use(hitl);

    await chain.runBeforeTool(makeCtx(), {
      toolName: "safe-tool", args: {}, stepIndex: 0,
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("should timeout and reject", async () => {
    const hitl = createHITLMiddleware({
      approvalHandler: () => new Promise(() => {}), // Never resolves
      timeoutMs: 50,
      onTimeout: "reject",
    });

    const chain = new MiddlewareChain();
    chain.use(hitl);

    const result = await chain.runBeforeTool(makeCtx(), {
      toolName: "test", args: {}, stepIndex: 0,
    });

    expect(result.skip).toBe(true);
    expect(result.mockResult).toMatchObject({ error: expect.stringContaining("timed out") });
  });
});

// =============================================================================
// ProcessorPipeline
// =============================================================================

describe("ProcessorPipeline", () => {
  it("should chain input processors", async () => {
    const pipeline = createProcessorPipeline({
      inputProcessors: [
        { name: "upper", process: async (p) => ({ value: p.toUpperCase() }) },
        { name: "trim", process: async (p) => ({ value: p.trim() }) },
      ],
    });

    const chain = new MiddlewareChain();
    chain.use(pipeline);

    const result = await chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams({ prompt: "  hello  " }));
    // First upper → "  HELLO  ", then trim → "HELLO"
    expect(result.prompt).toBe("HELLO");
  });

  it("should chain output processors", async () => {
    const pipeline = createProcessorPipeline({
      outputProcessors: [
        { name: "append", process: async (t) => ({ value: t + " [processed]" }) },
      ],
    });

    const chain = new MiddlewareChain();
    chain.use(pipeline);

    const result = await chain.runAfterAgent(makeCtx(), {
      prompt: "test",
      result: { text: "output", steps: [], sessionId: "s" },
    });

    expect(result.result.text).toBe("output [processed]");
  });

  it("should retry on failure", async () => {
    let attempts = 0;
    const pipeline = createProcessorPipeline({
      maxRetries: 2,
      retryDelayMs: 10,
      inputProcessors: [
        {
          name: "flaky",
          process: async (p) => {
            attempts++;
            if (attempts < 3) throw new Error("fail");
            return { value: p + "-ok" };
          },
        },
      ],
    });

    const chain = new MiddlewareChain();
    chain.use(pipeline);

    const result = await chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams());
    expect(result.prompt).toBe("Hello-ok");
    expect(attempts).toBe(3);
  });

  it("should fail after max retries", async () => {
    const pipeline = createProcessorPipeline({
      maxRetries: 1,
      retryDelayMs: 1,
      inputProcessors: [
        {
          name: "always-fail",
          process: async () => { throw new Error("permanent"); },
        },
      ],
    });

    const chain = new MiddlewareChain();
    chain.use(pipeline);

    // The pipeline middleware itself will throw, but the chain's error handling
    // will rethrow since no onError handler suppresses it
    await expect(
      chain.runBeforeAgent(makeCtx(), makeBeforeAgentParams()),
    ).rejects.toThrow("always-fail");
  });

  it("should propagate metadata through context", async () => {
    const pipeline = createProcessorPipeline({
      inputProcessors: [
        {
          name: "meta",
          process: async (p) => ({
            value: p,
            metadata: { language: "en" },
          }),
        },
      ],
    });

    const chain = new MiddlewareChain();
    chain.use(pipeline);

    const ctx = makeCtx();
    await chain.runBeforeAgent(ctx, makeBeforeAgentParams());
    expect(ctx.metadata.language).toBe("en");
  });
});
