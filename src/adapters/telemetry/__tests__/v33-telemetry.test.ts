// =============================================================================
// v33 Telemetry Adapter Tests — Helicone, Weights & Biases
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeliconeTelemetryAdapter } from "../helicone/helicone-telemetry.adapter.js";
import { WandbTelemetryAdapter } from "../wandb/wandb-telemetry.adapter.js";

// Mock fetch globally
const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Helicone
// ---------------------------------------------------------------------------

describe("HeliconeTelemetryAdapter", () => {
  let adapter: HeliconeTelemetryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new HeliconeTelemetryAdapter({
      config: { apiKey: "hk-test-key" },
    });
  });

  it("constructs with valid config", () => {
    expect(adapter).toBeInstanceOf(HeliconeTelemetryAdapter);
  });

  it("throws without config.apiKey", () => {
    expect(
      () => new HeliconeTelemetryAdapter({} as never),
    ).toThrow("HeliconeTelemetryAdapter requires config.apiKey");
  });

  it("startSpan returns a span that POSTs on end()", async () => {
    const span = adapter.startSpan("llm-call", { model: "gpt-4" });
    span.setAttribute("tokens", 150);
    span.setStatus("OK");
    span.end();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.helicone.ai/v1/log",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("recordMetric POSTs metric to Helicone API", async () => {
    adapter.recordMetric("latency_ms", 42, { endpoint: "/api" });
    await adapter.flush();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.helicone.ai/v1/log",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer hk-test-key",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Weights & Biases
// ---------------------------------------------------------------------------

describe("WandbTelemetryAdapter", () => {
  const mockRun = {
    log: vi.fn(),
    finish: vi.fn(),
  };

  const mockClient = {
    createRun: vi.fn().mockReturnValue(mockRun),
    log: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };

  let adapter: WandbTelemetryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WandbTelemetryAdapter({ client: mockClient });
  });

  it("accepts a pre-configured client", () => {
    expect(adapter).toBeInstanceOf(WandbTelemetryAdapter);
  });

  it("throws without client or valid config", () => {
    expect(
      () => new WandbTelemetryAdapter({} as never),
    ).toThrow(
      "WandbTelemetryAdapter requires either a client or config with apiKey and project",
    );
  });

  it("startSpan creates a run via client", async () => {
    const span = adapter.startSpan("eval-run", { input: "hello" });
    expect(span).toBeDefined();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ name: "eval-run" }),
    );
  });

  it("recordMetric delegates to client.log", async () => {
    adapter.recordMetric("accuracy", 0.95, { model: "gpt-4" });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockClient.log).toHaveBeenCalledWith(
      expect.objectContaining({ accuracy: 0.95 }),
    );
  });
});
