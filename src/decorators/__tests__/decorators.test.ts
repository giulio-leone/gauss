// =============================================================================
// Decorator Tests
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { Agent } from "../../core/agent/agent.js";
import { createMockProvider } from "../../testing/mock-provider.js";
import { memory } from "../memory.js";
import { telemetry } from "../telemetry.js";
import { resilience } from "../resilience.js";
import { costLimit } from "../cost-limit.js";
import { planning } from "../planning.js";
import { approval } from "../approval.js";
import { learning } from "../learning.js";
import { checkpoint } from "../checkpoint.js";

function simpleModel(text = "Hello!") {
  return createMockProvider([{ text }]);
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

describe("memory decorator", () => {
  it("loads and saves conversation", async () => {
    const store: Record<string, unknown[]> = {};
    const backend = {
      saveConversation: vi.fn(async (sid: string, msgs: unknown[]) => {
        store[sid] = [...(store[sid] ?? []), ...msgs];
      }),
      loadConversation: vi.fn(async (sid: string) => store[sid] ?? []),
      saveMetadata: vi.fn(),
      loadMetadata: vi.fn(async () => null),
    };

    const agent = Agent({ model: simpleModel("Response 1") })
      .with(memory({ backend, sessionId: "s1" }));

    await agent.run("Hello");

    expect(backend.loadConversation).toHaveBeenCalledWith("s1");
    expect(backend.saveConversation).toHaveBeenCalledWith("s1", expect.any(Array));
    expect(store["s1"]).toHaveLength(2); // user + assistant
  });
});

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

describe("telemetry decorator", () => {
  it("creates spans and records metrics", async () => {
    const span = {
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    const provider = {
      startSpan: vi.fn(() => span),
      recordMetric: vi.fn(),
      flush: vi.fn(),
    };

    const agent = Agent({ model: simpleModel(), name: "TestAgent" })
      .with(telemetry({ provider }));

    await agent.run("Test");

    expect(provider.startSpan).toHaveBeenCalledWith("agent.run", expect.any(Object));
    expect(span.setAttribute).toHaveBeenCalled();
    expect(span.setStatus).toHaveBeenCalledWith("ok");
    expect(span.end).toHaveBeenCalled();
    expect(provider.recordMetric).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------------------

describe("resilience decorator", () => {
  it("opens circuit breaker after failures", async () => {
    const errorModel = {
      specificationVersion: "v3",
      provider: "error",
      modelId: "error",
      async doGenerate() { throw new Error("fail"); },
      async doStream() { throw new Error("fail"); },
    } as never;

    const agent = Agent({ model: errorModel })
      .with(resilience({ circuitBreaker: { failureThreshold: 2, resetTimeout: 60000 } }));

    await expect(agent.run("1")).rejects.toThrow("fail");
    await expect(agent.run("2")).rejects.toThrow("fail");
    // 3rd call should hit circuit breaker
    await expect(agent.run("3")).rejects.toThrow("Circuit breaker is OPEN");
  });
});

// ---------------------------------------------------------------------------
// Cost Limit
// ---------------------------------------------------------------------------

describe("costLimit decorator", () => {
  it("tracks cost and enforces budget", async () => {
    const agent = Agent({ model: simpleModel() })
      .with(costLimit({ maxUsd: 0.01, inputCostPer1M: 3, outputCostPer1M: 15 }));

    const result = await agent.run("Test");
    expect(result.cost).toBeDefined();
    expect(result.cost!.totalUsd).toBeGreaterThan(0);
  });

  it("throws on budget exceeded (abort mode)", async () => {
    const agent = Agent({ model: simpleModel() })
      .with(costLimit({ maxUsd: 0.0000001 })); // impossibly low

    await expect(agent.run("Test")).rejects.toThrow("Budget exceeded");
  });
});

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

describe("planning decorator", () => {
  it("injects planning context", async () => {
    const agent = Agent({ model: simpleModel() })
      .with(planning());

    const result = await agent.run("Test");
    expect(result.text).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

describe("approval decorator", () => {
  it("approve-all mode passes without handler", async () => {
    const agent = Agent({ model: simpleModel() })
      .with(approval({ mode: "approve-all" }));

    const result = await agent.run("Test");
    expect(result.text).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

describe("learning decorator", () => {
  it("injects user profile and memories", async () => {
    const backend = {
      getProfile: vi.fn(async () => ({
        name: "Giulio",
        language: "Italian",
        style: "concise",
      })),
      getMemories: vi.fn(async () => [
        { id: "m1", content: "Prefers Rust", category: "tech", confidence: 0.9 },
      ]),
      addMemory: vi.fn(),
    };

    const agent = Agent({ model: simpleModel() })
      .with(learning({ backend, userId: "u1" }));

    await agent.run("Test");

    expect(backend.getProfile).toHaveBeenCalledWith("u1");
    expect(backend.getMemories).toHaveBeenCalledWith("u1", { limit: 10 });
  });
});

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

describe("checkpoint decorator", () => {
  it("loads from storage on beforeRun", async () => {
    const storage = {
      save: vi.fn(),
      load: vi.fn(async () => null),
      list: vi.fn(async () => []),
      deleteOld: vi.fn(),
    };

    const agent = Agent({ model: simpleModel() })
      .with(checkpoint({ storage, sessionId: "s1" }));

    await agent.run("Test");
    expect(storage.load).toHaveBeenCalledWith("s1");
  });
});

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

describe("decorator composition", () => {
  it("multiple decorators work together", async () => {
    const telemetryProvider = {
      startSpan: vi.fn(() => ({
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      })),
      recordMetric: vi.fn(),
      flush: vi.fn(),
    };

    const memoryBackend = {
      saveConversation: vi.fn(),
      loadConversation: vi.fn(async () => []),
      saveMetadata: vi.fn(),
      loadMetadata: vi.fn(async () => null),
    };

    const agent = Agent({ model: simpleModel("Composed!") })
      .with(memory({ backend: memoryBackend, sessionId: "s1" }))
      .with(telemetry({ provider: telemetryProvider }))
      .with(costLimit({ maxUsd: 1.0 }));

    const result = await agent.run("Test composition");

    expect(result.text).toBe("Composed!");
    expect(result.cost).toBeDefined();
    expect(telemetryProvider.startSpan).toHaveBeenCalled();
    expect(memoryBackend.saveConversation).toHaveBeenCalled();
  });
});
