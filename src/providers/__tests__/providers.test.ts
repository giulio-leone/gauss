// =============================================================================
// Provider Adapters — Tests
// =============================================================================

import { describe, it, expect } from "vitest";

describe("gauss/providers", () => {
  it("exports openai factory function", async () => {
    const { openai } = await import("../openai.js");
    expect(typeof openai).toBe("function");
  });

  it("exports anthropic factory function", async () => {
    const { anthropic } = await import("../anthropic.js");
    expect(typeof anthropic).toBe("function");
  });

  it("exports google factory function", async () => {
    const { google } = await import("../google.js");
    expect(typeof google).toBe("function");
  });

  it("exports groq factory function", async () => {
    const { groq } = await import("../groq.js");
    expect(typeof groq).toBe("function");
  });

  it("openai() returns a LanguageModel-compatible object", async () => {
    const { openai } = await import("../openai.js");
    const model = openai("gpt-5.2");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-5.2");
    expect(model.provider).toContain("openai");
  });

  it("anthropic() returns a LanguageModel-compatible object", async () => {
    const { anthropic } = await import("../anthropic.js");
    const model = anthropic("claude-sonnet-4-20250514");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-sonnet-4-20250514");
    expect(model.provider).toContain("anthropic");
  });

  it("google() returns a LanguageModel-compatible object", async () => {
    const { google } = await import("../google.js");
    const model = google("gemini-2.5-flash-preview-05-20");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gemini-2.5-flash-preview-05-20");
    expect(model.provider).toContain("google");
  });

  it("groq() returns a LanguageModel-compatible object", async () => {
    const { groq } = await import("../groq.js");
    const model = groq("llama-3.3-70b-versatile");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("llama-3.3-70b-versatile");
    expect(model.provider).toContain("groq");
  });

  it("barrel export re-exports all providers", async () => {
    const providers = await import("../index.js");
    expect(typeof providers.openai).toBe("function");
    expect(typeof providers.anthropic).toBe("function");
    expect(typeof providers.google).toBe("function");
    expect(typeof providers.groq).toBe("function");
    expect(typeof providers.ollama).toBe("function");
    expect(typeof providers.openrouter).toBe("function");
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
