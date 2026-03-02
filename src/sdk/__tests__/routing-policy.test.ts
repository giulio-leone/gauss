import { describe, it, expect } from "vitest";

import {
  enforceRoutingCostLimit,
  resolveFallbackProvider,
  resolveRoutingTarget,
} from "../routing-policy.js";

describe("routing-policy helpers", () => {
  it("resolves alias candidates by priority", () => {
    const resolved = resolveRoutingTarget(
      {
        aliases: {
          "fast-chat": [
            { provider: "openai", model: "gpt-4o-mini", priority: 1 },
            { provider: "anthropic", model: "claude-3-5-haiku-latest", priority: 10 },
          ],
        },
      },
      "openai",
      "fast-chat",
    );
    expect(resolved.provider).toBe("anthropic");
    expect(resolved.model).toBe("claude-3-5-haiku-latest");
    expect(resolved.selectedBy).toBe("alias:fast-chat");
  });

  it("resolves fallback provider when primary is unavailable", () => {
    const fallback = resolveFallbackProvider(
      { fallbackOrder: ["anthropic", "openai"] },
      ["openai"],
    );
    expect(fallback).toBe("openai");

    const resolved = resolveRoutingTarget(
      { fallbackOrder: ["anthropic", "openai"] },
      "google",
      "gpt-5.2",
      { availableProviders: ["openai"] },
    );
    expect(resolved.provider).toBe("openai");
    expect(resolved.model).toBe("gpt-5.2");
    expect(resolved.selectedBy).toBe("fallback:openai");
  });

  it("enforces policy cost limit", () => {
    expect(() => enforceRoutingCostLimit({ maxTotalCostUsd: 1 }, 1.5)).toThrow(
      "routing policy rejected cost 1.5",
    );
    expect(() => enforceRoutingCostLimit({ maxTotalCostUsd: 2 }, 1.5)).not.toThrow();
  });
});

