// =============================================================================
// v32 Telemetry Adapter Tests — Arize, Braintrust, PostHog, Laminar
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArizeTelemetryAdapter } from "../arize/arize-telemetry.adapter.js";
import { BraintrustTelemetryAdapter } from "../braintrust/braintrust-telemetry.adapter.js";
import { PostHogTelemetryAdapter } from "../posthog/posthog-telemetry.adapter.js";
import { LaminarTelemetryAdapter } from "../laminar/laminar-telemetry.adapter.js";

// ---------------------------------------------------------------------------
// Arize
// ---------------------------------------------------------------------------

describe("ArizeTelemetryAdapter", () => {
  const mockTrace = {
    id: "trace-1",
    setAttribute: vi.fn(),
    end: vi.fn(),
  };

  const mockClient = {
    createTrace: vi.fn().mockReturnValue(mockTrace),
    logScore: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };

  let adapter: ArizeTelemetryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ArizeTelemetryAdapter({ client: mockClient });
  });

  it("accepts a pre-configured client", () => {
    expect(adapter).toBeInstanceOf(ArizeTelemetryAdapter);
  });

  it("throws without client or config", () => {
    expect(() => new ArizeTelemetryAdapter({} as never)).toThrow(
      "ArizeTelemetryAdapter requires either a client or config",
    );
  });

  it("startSpan creates a trace via client", async () => {
    const span = adapter.startSpan("test-span", { key: "value" });
    expect(span).toBeDefined();
    // Allow async chain to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.createTrace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-span" }),
    );
  });

  it("recordMetric delegates to client.logScore", async () => {
    adapter.recordMetric("accuracy", 0.95, { model: "gpt-4" });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.logScore).toHaveBeenCalledWith(
      expect.objectContaining({ name: "accuracy", value: 0.95 }),
    );
  });

  it("flush delegates to client.flush", async () => {
    await adapter.flush();
    expect(mockClient.flush).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Braintrust
// ---------------------------------------------------------------------------

describe("BraintrustTelemetryAdapter", () => {
  const mockSpan = {
    id: "span-1",
    log: vi.fn(),
    end: vi.fn(),
  };

  const mockClient = {
    startSpan: vi.fn().mockReturnValue(mockSpan),
    log: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };

  let adapter: BraintrustTelemetryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new BraintrustTelemetryAdapter({ client: mockClient });
  });

  it("accepts a pre-configured client", () => {
    expect(adapter).toBeInstanceOf(BraintrustTelemetryAdapter);
  });

  it("throws without client or config", () => {
    expect(() => new BraintrustTelemetryAdapter({} as never)).toThrow(
      "BraintrustTelemetryAdapter requires either a client or config",
    );
  });

  it("startSpan creates an experiment span via client", async () => {
    const span = adapter.startSpan("eval-run", { input: "hello" });
    expect(span).toBeDefined();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "eval-run" }),
    );
  });

  it("recordMetric delegates to client.log with scores", async () => {
    adapter.recordMetric("faithfulness", 0.88, { source: "test" });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.log).toHaveBeenCalledWith(
      expect.objectContaining({
        scores: { faithfulness: 0.88 },
      }),
    );
  });

  it("flush delegates to client.flush", async () => {
    await adapter.flush();
    expect(mockClient.flush).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PostHog
// ---------------------------------------------------------------------------

describe("PostHogTelemetryAdapter", () => {
  const mockClient = {
    capture: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  let adapter: PostHogTelemetryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PostHogTelemetryAdapter({ client: mockClient });
  });

  it("accepts a pre-configured client", () => {
    expect(adapter).toBeInstanceOf(PostHogTelemetryAdapter);
  });

  it("throws without client or config", () => {
    expect(() => new PostHogTelemetryAdapter({} as never)).toThrow(
      "PostHogTelemetryAdapter requires either a client or config",
    );
  });

  it("startSpan creates a span that captures event on end", async () => {
    const span = adapter.startSpan("llm-call", { model: "gpt-4" });
    span.setAttribute("tokens", 150);
    span.setStatus("OK");
    span.end();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "span:llm-call",
        properties: expect.objectContaining({
          model: "gpt-4",
          tokens: 150,
          status: "OK",
        }),
      }),
    );
  });

  it("recordMetric captures a metric event", async () => {
    adapter.recordMetric("latency_ms", 120, { endpoint: "/api" });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "metric:latency_ms",
        properties: expect.objectContaining({ value: 120 }),
      }),
    );
  });

  it("flush delegates to client.flush and shutdown", async () => {
    await adapter.flush();
    expect(mockClient.flush).toHaveBeenCalled();
    expect(mockClient.shutdown).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Laminar
// ---------------------------------------------------------------------------

describe("LaminarTelemetryAdapter", () => {
  const mockSpan = {
    id: "span-1",
    setAttribute: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
  };

  const mockClient = {
    startSpan: vi.fn().mockReturnValue(mockSpan),
    evaluate: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };

  let adapter: LaminarTelemetryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new LaminarTelemetryAdapter({ client: mockClient });
  });

  it("accepts a pre-configured client", () => {
    expect(adapter).toBeInstanceOf(LaminarTelemetryAdapter);
  });

  it("throws without client or config", () => {
    expect(() => new LaminarTelemetryAdapter({} as never)).toThrow(
      "LaminarTelemetryAdapter requires either a client or config",
    );
  });

  it("startSpan creates a Laminar trace span", async () => {
    const span = adapter.startSpan("pipeline-run", { step: "embed" });
    expect(span).toBeDefined();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "pipeline-run" }),
    );
  });

  it("recordMetric delegates to client.evaluate", async () => {
    adapter.recordMetric("relevance", 0.92, { query: "test" });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "relevance", score: 0.92 }),
    );
  });

  it("flush delegates to client.flush", async () => {
    await adapter.flush();
    expect(mockClient.flush).toHaveBeenCalled();
  });
});
