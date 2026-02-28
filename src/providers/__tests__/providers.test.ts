// =============================================================================
// Provider Adapters — Tests
// =============================================================================

import { describe, it, expect } from "vitest";

describe("gauss/providers", () => {
  it("barrel export re-exports native gauss provider", async () => {
    const providers = await import("../index.js");
    expect(typeof providers.gauss).toBe("function");
    expect(typeof providers.ollama).toBe("function");
    expect(typeof providers.openrouter).toBe("function");
    expect(typeof providers.universalProvider).toBe("function");
  });

  it("ollama() returns a LanguageModel-compatible object with local defaults", async () => {
    const { ollama } = await import("../ollama.js");
    const model = ollama("llama3.2");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("llama3.2");
  });

  it("openrouter() returns a LanguageModel-compatible object", async () => {
    const { openrouter } = await import("../openrouter.js");
    const model = openrouter("anthropic/claude-sonnet-4-20250514");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("anthropic/claude-sonnet-4-20250514");
  });
});
