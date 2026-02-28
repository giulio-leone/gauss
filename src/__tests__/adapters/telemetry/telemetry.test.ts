import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "../../../core/llm/index.js";

import { ConsoleTelemetryAdapter } from "../../../adapters/telemetry/console-telemetry.adapter.js";
import { OtelTelemetryAdapter } from "../../../adapters/telemetry/otel-telemetry.adapter.js";
import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

// =============================================================================
// Mock AI SDK — ToolLoopAgent (for Agent integration tests)
// =============================================================================

const { generateFn, constructorSpy } = vi.hoisted(() => {
  const generateFn = vi.fn().mockResolvedValue({
    text: "Mock response",
    steps: [{ type: "text", toolName: "readFile" }],
    usage: { promptTokens: 100, completionTokens: 50 },
    finishReason: "stop",
    toolCalls: [],
    toolResults: [],
  });
  const constructorSpy = vi.fn();
  return { generateFn, constructorSpy };
});

vi.mock("../../../core/llm/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../core/llm/index.js")>();
  return {
    ...actual,
    generateText: (opts: Record<string, unknown>) => {
      constructorSpy(opts);
      return generateFn(opts);
    },
  };
});

// =============================================================================
// ConsoleTelemetryAdapter
// =============================================================================

describe("ConsoleTelemetryAdapter", () => {
  let adapter: ConsoleTelemetryAdapter;

  beforeEach(() => {
    adapter = new ConsoleTelemetryAdapter();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("startSpan returns a span and logs to console", () => {
    const span = adapter.startSpan("test.op", { key: "val" });
    expect(span).toBeDefined();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("span:start test.op"),
      expect.objectContaining({ key: "val" }),
    );
  });

  it("span.setAttribute stores attributes", () => {
    const span = adapter.startSpan("test.op");
    span.setAttribute("count", 42);
    span.setAttribute("enabled", true);
    // No throw — attributes stored internally
  });

  it("span.setStatus sets status", () => {
    const span = adapter.startSpan("test.op");
    span.setStatus("OK");
    span.setStatus("ERROR", "something broke");
    // No throw
  });

  it("span.end logs span completion", () => {
    const span = adapter.startSpan("test.op");
    span.end();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("span:end test.op"),
      expect.any(Object),
    );
  });

  it("recordMetric logs metric to console", () => {
    adapter.recordMetric("my.metric", 42, { env: "test" });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("metric my.metric=42"),
      expect.objectContaining({ env: "test" }),
    );
  });

  it("flush resolves immediately", async () => {
    await expect(adapter.flush()).resolves.toBeUndefined();
  });
});

// =============================================================================
// OtelTelemetryAdapter
// =============================================================================

describe("OtelTelemetryAdapter", () => {
  function createMockTracer() {
    const mockOtelSpan = {
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    const tracer = {
      startSpan: vi.fn().mockReturnValue(mockOtelSpan),
    };
    return { tracer, mockOtelSpan };
  }

  function createMockMeter() {
    const mockHistogram = { record: vi.fn() };
    const meter = {
      createHistogram: vi.fn().mockReturnValue(mockHistogram),
    };
    return { meter, mockHistogram };
  }

  it("startSpan delegates to tracer.startSpan", () => {
    const { tracer, mockOtelSpan } = createMockTracer();
    const adapter = new OtelTelemetryAdapter(tracer);

    const span = adapter.startSpan("test.op", { key: "val" });
    expect(tracer.startSpan).toHaveBeenCalledWith("test.op", { attributes: { key: "val" } });
    expect(span).toBeDefined();

    span.setAttribute("k", "v");
    expect(mockOtelSpan.setAttribute).toHaveBeenCalledWith("k", "v");
  });

  it("span.setStatus maps OK/ERROR to OTel codes", () => {
    const { tracer, mockOtelSpan } = createMockTracer();
    const adapter = new OtelTelemetryAdapter(tracer);

    const span = adapter.startSpan("test.op");
    span.setStatus("OK");
    expect(mockOtelSpan.setStatus).toHaveBeenCalledWith({ code: 1, message: undefined });

    span.setStatus("ERROR", "boom");
    expect(mockOtelSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: "boom" });
  });

  it("span.end delegates to otel span", () => {
    const { tracer, mockOtelSpan } = createMockTracer();
    const adapter = new OtelTelemetryAdapter(tracer);

    const span = adapter.startSpan("test.op");
    span.end();
    expect(mockOtelSpan.end).toHaveBeenCalled();
  });

  it("recordMetric uses meter histogram", () => {
    const { tracer } = createMockTracer();
    const { meter, mockHistogram } = createMockMeter();
    const adapter = new OtelTelemetryAdapter(tracer, meter);

    adapter.recordMetric("test.metric", 99, { env: "prod" });
    expect(meter.createHistogram).toHaveBeenCalledWith("test.metric");
    expect(mockHistogram.record).toHaveBeenCalledWith(99, { env: "prod" });
  });

  it("recordMetric without meter is a no-op", () => {
    const { tracer } = createMockTracer();
    const adapter = new OtelTelemetryAdapter(tracer);
    // Should not throw
    adapter.recordMetric("test.metric", 1);
  });

  it("flush resolves", async () => {
    const { tracer } = createMockTracer();
    const adapter = new OtelTelemetryAdapter(tracer);
    await expect(adapter.flush()).resolves.toBeUndefined();
  });
});

// =============================================================================
// Agent Integration — Telemetry spans for tool/LLM calls
// =============================================================================

describe("Agent telemetry integration", () => {
  const mockModel = {
    modelId: "test-model",
    provider: "test",
  } as unknown as LanguageModel;

  beforeEach(() => {
    vi.clearAllMocks();
    generateFn.mockResolvedValue({
      text: "Mock response",
      steps: [{ type: "tool", toolName: "readFile" }],
      usage: { promptTokens: 100, completionTokens: 50 },
    });
  });

  function createSpyTelemetry(): TelemetryPort & {
    spans: Array<{ name: string; attributes: Record<string, string | number | boolean>; status?: string; ended: boolean }>;
    metrics: Array<{ name: string; value: number; attributes?: Record<string, string> }>;
  } {
    const spans: Array<{
      name: string;
      attributes: Record<string, string | number | boolean>;
      status?: string;
      statusMessage?: string;
      ended: boolean;
    }> = [];
    const metrics: Array<{ name: string; value: number; attributes?: Record<string, string> }> = [];

    return {
      spans,
      metrics,
      startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
        const spanRecord = { name, attributes: { ...attributes } as Record<string, string | number | boolean>, ended: false, status: undefined as string | undefined };
        spans.push(spanRecord);
        return {
          setAttribute(k: string, v: string | number | boolean) { spanRecord.attributes[k] = v; },
          setStatus(code: "OK" | "ERROR") { spanRecord.status = code; },
          end() { spanRecord.ended = true; },
        };
      },
      recordMetric(name: string, value: number, attributes?: Record<string, string>) {
        metrics.push({ name, value, attributes });
      },
      async flush() {},
    };
  }

  it("creates llm.generate span and tool spans during run", async () => {
    // Dynamically import to get the mocked version
    const { Agent } = await import("../../../agent/agent.js");

    const telemetry = createSpyTelemetry();

    const agent = Agent.create({
      model: mockModel,
      instructions: "Test",
    })
      .withPlanning()
      .withTelemetry(telemetry)
      .build();

    await agent.run("Hello");
    await agent.dispose();

    // Should have llm.generate span
    const llmSpan = telemetry.spans.find((s) => s.name === "llm.generate");
    expect(llmSpan).toBeDefined();
    expect(llmSpan!.status).toBe("OK");
    expect(llmSpan!.ended).toBe(true);

    // Should have tool span
    const toolSpan = telemetry.spans.find((s) => s.name === "tool.readFile");
    expect(toolSpan).toBeDefined();
    expect(toolSpan!.status).toBe("OK");
    expect(toolSpan!.ended).toBe(true);

    // Should record token metrics
    const inputMetric = telemetry.metrics.find((m) => m.name === "llm.tokens.input");
    expect(inputMetric).toBeDefined();
    expect(inputMetric!.value).toBe(100);

    const outputMetric = telemetry.metrics.find((m) => m.name === "llm.tokens.output");
    expect(outputMetric).toBeDefined();
    expect(outputMetric!.value).toBe(50);

    // Should record tool duration
    const toolDuration = telemetry.metrics.find((m) => m.name === "tool.duration_ms");
    expect(toolDuration).toBeDefined();
    expect(toolDuration!.value).toBeGreaterThanOrEqual(0);
  });

  it("builder exposes withTelemetry method", async () => {
    const { Agent } = await import("../../../agent/agent.js");

    const builder = Agent.create({
      model: mockModel,
      instructions: "Test",
    });
    expect(builder).toHaveProperty("withTelemetry");
  });
});

// =============================================================================
// AgentGraph — Span propagation
// =============================================================================

describe("AgentGraph telemetry propagation", () => {
  const mockModel = {
    modelId: "test-model",
    provider: "test",
  } as unknown as LanguageModel;

  beforeEach(() => {
    vi.clearAllMocks();
    generateFn.mockResolvedValue({
      text: "node output",
      steps: [],
    });
  });

  it("creates child spans for each graph node", async () => {
    const { AgentGraph } = await import("../../../graph/agent-graph.js");

    const spans: Array<{ name: string; status?: string; ended: boolean }> = [];
    const telemetry: TelemetryPort = {
      startSpan(name: string) {
        const span = { name, status: undefined as string | undefined, ended: false };
        spans.push(span);
        return {
          setAttribute() {},
          setStatus(code: "OK" | "ERROR") { span.status = code; },
          end() { span.ended = true; },
        };
      },
      recordMetric() {},
      async flush() {},
    };

    const graph = AgentGraph.create()
      .node("a", { model: mockModel, instructions: "Agent A" })
      .node("b", { model: mockModel, instructions: "Agent B" })
      .edge("a", "b")
      .withTelemetry(telemetry)
      .build();

    await graph.run("test prompt");

    // Should have spans for each node
    const nodeASpan = spans.find((s) => s.name === "graph.node.a");
    const nodeBSpan = spans.find((s) => s.name === "graph.node.b");
    expect(nodeASpan).toBeDefined();
    expect(nodeASpan!.ended).toBe(true);
    expect(nodeASpan!.status).toBe("OK");
    expect(nodeBSpan).toBeDefined();
    expect(nodeBSpan!.ended).toBe(true);
    expect(nodeBSpan!.status).toBe("OK");
  });
});
