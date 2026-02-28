import { describe, it, expect, beforeEach } from "vitest";
import { PlaygroundCollector } from "../playground-collector.js";

describe("PlaygroundCollector", () => {
  let collector: PlaygroundCollector;

  beforeEach(() => {
    collector = new PlaygroundCollector();
  });

  it("records and retrieves traces", () => {
    collector.recordTrace({
      id: "span-1",
      name: "agent.run",
      startTime: 1000,
      endTime: 1500,
      status: "ok",
      attributes: { model: "gpt-5.2" },
      events: [],
    });
    const traces = collector.getTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].id).toBe("span-1");
    expect(traces[0].name).toBe("agent.run");
  });

  it("records and retrieves token usage", () => {
    collector.recordTokenUsage({
      runId: "run-1",
      model: "gpt-5.2",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.003,
      timestamp: Date.now(),
    });
    const usage = collector.getTokenUsage();
    expect(usage).toHaveLength(1);
    expect(usage[0].totalTokens).toBe(150);
  });

  it("records and retrieves tool calls with I/O", () => {
    collector.recordToolCall({
      id: "tc-1",
      runId: "run-1",
      toolName: "weather",
      input: { city: "Rome" },
      output: { temp: 25 },
      durationMs: 120,
      status: "success",
      timestamp: Date.now(),
    });
    const calls = collector.getToolCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe("weather");
    expect(calls[0].input).toEqual({ city: "Rome" });
    expect(calls[0].output).toEqual({ temp: 25 });
  });

  it("tracks circuit breaker state", () => {
    collector.updateCircuitBreaker({
      state: "open",
      failureCount: 5,
      successCount: 10,
      lastFailure: Date.now(),
      lastStateChange: Date.now(),
    });
    const metrics = collector.getReliabilityMetrics();
    expect(metrics.circuitBreaker.state).toBe("open");
    expect(metrics.circuitBreaker.failureCount).toBe(5);
  });

  it("records retry events", () => {
    collector.recordRetry({ toolName: "api-call", attempts: 3, success: true, timestamp: Date.now() });
    collector.recordRetry({ toolName: "db-query", attempts: 2, success: false, timestamp: Date.now() });
    const metrics = collector.getReliabilityMetrics();
    expect(metrics.retries.totalAttempts).toBe(2);
    expect(metrics.retries.successfulRetries).toBe(1);
    expect(metrics.retries.failedRetries).toBe(1);
    expect(metrics.retries.recentRetries).toHaveLength(2);
  });

  it("respects maximum limits", () => {
    const small = new PlaygroundCollector({ maxTraces: 2 });
    for (let i = 0; i < 5; i++) {
      small.recordTrace({
        id: `span-${i}`,
        name: "test",
        startTime: i,
        endTime: i + 1,
        status: "ok",
        attributes: {},
        events: [],
      });
    }
    expect(small.getTraces()).toHaveLength(2);
    expect(small.getTraces()[0].id).toBe("span-3");
  });

  it("clear resets all data", () => {
    collector.recordTrace({ id: "t1", name: "test", startTime: 0, endTime: 1, status: "ok", attributes: {}, events: [] });
    collector.recordTokenUsage({ runId: "r1", model: "m", inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0, timestamp: 0 });
    collector.recordToolCall({ id: "tc1", runId: "r1", toolName: "t", input: {}, output: null, durationMs: 0, status: "success", timestamp: 0 });
    collector.clear();
    expect(collector.getTraces()).toHaveLength(0);
    expect(collector.getTokenUsage()).toHaveLength(0);
    expect(collector.getToolCalls()).toHaveLength(0);
  });

  it("asPlaygroundAgent creates a valid PlaygroundAgent", async () => {
    const pa = collector.asPlaygroundAgent({
      name: "test-agent",
      description: "Test",
      invoke: async (prompt) => `Echo: ${prompt}`,
    });
    expect(pa.name).toBe("test-agent");
    expect(typeof pa.getTraces).toBe("function");
    expect(typeof pa.getTokenUsage).toBe("function");
    expect(typeof pa.getToolCalls).toBe("function");
    expect(typeof pa.getReliabilityMetrics).toBe("function");
    expect(await pa.getTraces!()).toEqual([]);
  });
});
