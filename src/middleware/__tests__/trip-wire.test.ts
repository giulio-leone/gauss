import { describe, it, expect, vi } from "vitest";
import { createTripWireMiddleware, type TripWireViolation } from "../trip-wire.js";
import type { MiddlewareContext, BeforeAgentParams, BeforeToolCallParams, AfterToolCallParams } from "../../ports/middleware.port.js";

function makeCtx(): MiddlewareContext {
  return { sessionId: "test", timestamp: Date.now(), metadata: {} };
}

function makeAgentParams(): BeforeAgentParams {
  return { prompt: "hello", instructions: "be helpful", tools: {} };
}

function makeToolParams(name = "test"): BeforeToolCallParams {
  return { toolName: name, args: {}, stepIndex: 0 };
}

describe("TripWire Middleware", () => {
  it("allows execution within limits", () => {
    const mw = createTripWireMiddleware({ maxSteps: 10, maxToolCalls: 5 });
    const result = mw.beforeAgent!(makeCtx(), makeAgentParams());
    expect(result?.abort).toBeFalsy();
  });

  it("trips on maxSteps", () => {
    const trips: TripWireViolation[] = [];
    const mw = createTripWireMiddleware({
      maxSteps: 2,
      onTrip: (v) => trips.push(v),
    });
    const ctx = makeCtx();
    mw.beforeAgent!(ctx, makeAgentParams()); // step 1
    mw.beforeAgent!(ctx, makeAgentParams()); // step 2
    const result = mw.beforeAgent!(ctx, makeAgentParams()); // step 3 → trip
    expect(result?.abort).toBe(true);
    expect(trips).toHaveLength(1);
    expect(trips[0].wire).toBe("steps");
  });

  it("trips on maxToolCalls", () => {
    const trips: TripWireViolation[] = [];
    const mw = createTripWireMiddleware({
      maxToolCalls: 2,
      onTrip: (v) => trips.push(v),
    });
    const ctx = makeCtx();
    mw.beforeTool!(ctx, makeToolParams());
    mw.beforeTool!(ctx, makeToolParams());
    const result = mw.beforeTool!(ctx, makeToolParams());
    expect(result?.skip).toBe(true);
    expect(trips[0].wire).toBe("toolCalls");
  });

  it("trips on maxTimeMs", () => {
    vi.useFakeTimers();
    const mw = createTripWireMiddleware({ maxTimeMs: 1000 });
    const ctx = makeCtx();
    mw.beforeAgent!(ctx, makeAgentParams()); // start timer
    vi.advanceTimersByTime(1500);
    const result = mw.beforeAgent!(ctx, makeAgentParams());
    expect(result?.abort).toBe(true);
    vi.useRealTimers();
  });

  it("tracks stats", () => {
    const mw = createTripWireMiddleware({});
    const ctx = makeCtx();
    mw.beforeAgent!(ctx, makeAgentParams());
    mw.beforeTool!(ctx, makeToolParams());
    mw.beforeTool!(ctx, makeToolParams());
    const stats = mw.stats();
    expect(stats.stepCount).toBe(1);
    expect(stats.toolCallCount).toBe(2);
  });

  it("reset clears stats", () => {
    const mw = createTripWireMiddleware({});
    const ctx = makeCtx();
    mw.beforeAgent!(ctx, makeAgentParams());
    mw.beforeTool!(ctx, makeToolParams());
    mw.reset();
    const stats = mw.stats();
    expect(stats.stepCount).toBe(0);
    expect(stats.toolCallCount).toBe(0);
  });

  it("tracks tokens from afterTool", () => {
    const mw = createTripWireMiddleware({ maxTokens: 100 });
    const ctx = makeCtx();
    mw.beforeAgent!(ctx, makeAgentParams());
    mw.afterTool!(ctx, {
      toolName: "t",
      args: {},
      result: { tokens: 50 },
      stepIndex: 0,
      durationMs: 10,
    } as AfterToolCallParams);
    expect(mw.stats().totalTokens).toBe(50);
  });
});
