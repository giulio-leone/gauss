import { describe, it, expect, vi } from "vitest";
import { ModelRouter, CostOptimalPolicy, LatencyOptimalPolicy, CapabilityPolicy, FallbackPolicy } from "../router.adapter.js";
import type { ModelProviderInfo } from "../router.adapter.js";
import type { ModelPort } from "../../../ports/model.port.js";

// =============================================================================
// Helpers
// =============================================================================

function mockModelPort(id: string): ModelPort {
  return {
    getModel: () => ({ modelId: id } as never),
    getContextWindowSize: () => 128_000,
    getModelId: () => id,
    generate: vi.fn().mockResolvedValue({
      text: `response-from-${id}`,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    }),
    generateStream: vi.fn(),
  };
}

function makeProvider(
  id: string,
  overrides: Partial<ModelProviderInfo> = {},
): ModelProviderInfo {
  return {
    id,
    provider: id.split(":")[0],
    model: id.split(":")[1] ?? id,
    contextWindow: 128_000,
    capabilities: ["text", "function-calling"],
    healthy: true,
    ...overrides,
  };
}

// =============================================================================
// Routing Policies
// =============================================================================

describe("Routing Policies", () => {
  const providers: ModelProviderInfo[] = [
    makeProvider("openai:gpt-4o", {
      costPerInputKToken: 5,
      costPerOutputKToken: 15,
      avgLatencyMs: 500,
      capabilities: ["text", "function-calling", "vision", "json-mode"],
    }),
    makeProvider("anthropic:claude-3.5", {
      costPerInputKToken: 3,
      costPerOutputKToken: 15,
      avgLatencyMs: 800,
      capabilities: ["text", "function-calling", "vision"],
    }),
    makeProvider("ollama:llama3", {
      costPerInputKToken: 0,
      costPerOutputKToken: 0,
      avgLatencyMs: 200,
      capabilities: ["text"],
    }),
  ];

  describe("CostOptimalPolicy", () => {
    it("should select cheapest provider", () => {
      const selected = CostOptimalPolicy.select(providers, {});
      expect(selected?.id).toBe("ollama:llama3");
    });

    it("should respect capability requirements", () => {
      const selected = CostOptimalPolicy.select(providers, {
        requiredCapabilities: ["vision"],
      });
      expect(selected?.id).toBe("anthropic:claude-3.5");
    });
  });

  describe("LatencyOptimalPolicy", () => {
    it("should select fastest provider", () => {
      const selected = LatencyOptimalPolicy.select(providers, {});
      expect(selected?.id).toBe("ollama:llama3");
    });

    it("should filter by latency threshold", () => {
      const selected = LatencyOptimalPolicy.select(providers, {
        maxLatencyMs: 600,
      });
      expect(selected?.id).toBe("ollama:llama3");
    });
  });

  describe("CapabilityPolicy", () => {
    it("should select provider with most capabilities", () => {
      const selected = CapabilityPolicy.select(providers, {});
      expect(selected?.id).toBe("openai:gpt-4o");
    });
  });

  describe("FallbackPolicy", () => {
    it("should select first healthy provider", () => {
      const selected = FallbackPolicy.select(providers, {});
      expect(selected?.id).toBe("openai:gpt-4o");
    });

    it("should skip unhealthy providers", () => {
      const unhealthy = providers.map((p) =>
        p.id === "openai:gpt-4o" ? { ...p, healthy: false } : p,
      );
      const selected = FallbackPolicy.select(unhealthy, {});
      expect(selected?.id).toBe("anthropic:claude-3.5");
    });

    it("should return null when no providers match", () => {
      const selected = FallbackPolicy.select(
        providers.map((p) => ({ ...p, healthy: false })),
        {},
      );
      expect(selected).toBeNull();
    });
  });
});

// =============================================================================
// ModelRouter
// =============================================================================

describe("ModelRouter", () => {
  it("should route to provider based on policy", async () => {
    const router = new ModelRouter(CostOptimalPolicy);

    router.register(
      makeProvider("openai:gpt-4o", { costPerInputKToken: 5, costPerOutputKToken: 15 }),
      mockModelPort("openai:gpt-4o"),
    );
    router.register(
      makeProvider("ollama:llama3", { costPerInputKToken: 0, costPerOutputKToken: 0 }),
      mockModelPort("ollama:llama3"),
    );

    const result = await router.generate({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.text).toBe("response-from-ollama:llama3");
  });

  it("should switch policy at runtime", () => {
    const router = new ModelRouter(CostOptimalPolicy);
    router.register(
      makeProvider("openai:gpt-4o", { costPerInputKToken: 5, costPerOutputKToken: 15, avgLatencyMs: 100 }),
      mockModelPort("openai:gpt-4o"),
    );
    router.register(
      makeProvider("ollama:llama3", { costPerInputKToken: 0, costPerOutputKToken: 0, avgLatencyMs: 500 }),
      mockModelPort("ollama:llama3"),
    );

    expect(router.getModelId()).toBe("ollama:llama3");

    router.setPolicy(LatencyOptimalPolicy);
    const resolved = router.resolve();
    expect(resolved.getModelId()).toBe("openai:gpt-4o");
  });

  it("should track latency with EMA", () => {
    const router = new ModelRouter();
    router.register(
      makeProvider("test:model", { avgLatencyMs: 100 }),
      mockModelPort("test:model"),
    );

    router.recordLatency("test:model", 200);
    const providers = router.getProviders();
    expect(providers[0].avgLatencyMs).toBeCloseTo(130);
  });

  it("should mark providers unhealthy and recover", () => {
    const router = new ModelRouter(FallbackPolicy);
    router.register(makeProvider("a"), mockModelPort("a"));
    router.register(makeProvider("b"), mockModelPort("b"));

    router.markUnhealthy("a");
    expect(router.resolve().getModelId()).toBe("b");

    router.markHealthy("a");
    expect(router.resolve().getModelId()).toBe("a");
  });

  it("should throw when no provider matches", () => {
    const router = new ModelRouter(FallbackPolicy);
    expect(() => router.resolve()).toThrow("no provider matches");
  });

  it("should list providers", () => {
    const router = new ModelRouter();
    router.register(makeProvider("a"), mockModelPort("a"));
    router.register(makeProvider("b"), mockModelPort("b"));
    expect(router.getProviders()).toHaveLength(2);
  });

  it("should unregister providers", () => {
    const router = new ModelRouter();
    router.register(makeProvider("a"), mockModelPort("a"));
    expect(router.unregister("a")).toBe(true);
    expect(router.getProviders()).toHaveLength(0);
  });

  it("should fallback on generate failure", async () => {
    const router = new ModelRouter(FallbackPolicy);
    const failAdapter: ModelPort = {
      getModel: () => ({ modelId: "fail" } as never),
      getContextWindowSize: () => 128_000,
      getModelId: () => "fail",
      generate: vi.fn().mockRejectedValue(new Error("provider down")),
    };
    const goodAdapter = mockModelPort("good");

    router.register(makeProvider("fail-provider"), failAdapter);
    router.register(makeProvider("good-provider"), goodAdapter);

    const result = await router.generate({
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.text).toBe("response-from-good");
  });
});
