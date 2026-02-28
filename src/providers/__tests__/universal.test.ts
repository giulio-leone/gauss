import { describe, it, expect, vi } from "vitest";
import { UniversalProvider, universalProvider } from "../universal.js";

// Mock wrapV3Model to be a passthrough (avoids needing real V3 model structure)
vi.mock("../../core/llm/v3-adapter.js", () => ({
  wrapV3Model: vi.fn((model: any) => model),
}));

// Mock the AI SDK packages — OpenAI needs .chat() per registry spec
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn((config: any) => {
    const provider = (modelId: string) => ({ modelId, provider: "openai", ...config });
    provider.chat = (modelId: string) => ({ modelId, provider: "openai", via: "chat", ...config });
    return provider;
  }),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn((config: any) => {
    return (modelId: string) => ({ modelId, provider: "anthropic", ...config });
  }),
}));

describe("UniversalProvider", () => {
  it("creates via factory function", () => {
    const p = universalProvider();
    expect(p).toBeInstanceOf(UniversalProvider);
  });

  it("lists known providers from registry", () => {
    const p = new UniversalProvider();
    const list = p.listProviders();
    expect(list).toContain("openai");
    expect(list).toContain("anthropic");
    expect(list).toContain("google");
    expect(list).toContain("groq");
    expect(list).toContain("mistral");
    expect(list).toContain("deepseek");
    expect(list).toContain("xai");
    expect(list).toContain("perplexity");
    expect(list.length).toBeGreaterThan(25);
  });

  it("gets model by provider + modelId (chat access for OpenAI)", async () => {
    const p = new UniversalProvider();
    const model = await p.model("openai", "gpt-5.2");
    expect((model as any).modelId).toBe("gpt-5.2");
    expect((model as any).via).toBe("chat");
  });

  it("gets model by provider + modelId (direct access for Anthropic)", async () => {
    const p = new UniversalProvider();
    const model = await p.model("anthropic", "claude-sonnet-4-20250514");
    expect((model as any).modelId).toBe("claude-sonnet-4-20250514");
    expect((model as any).provider).toBe("anthropic");
    expect((model as any).via).toBeUndefined();
  });

  it("gets model by specifier string", async () => {
    const p = new UniversalProvider();
    const model = await p.get("openai:gpt-5.2");
    expect((model as any).modelId).toBe("gpt-5.2");
  });

  it("throws on invalid specifier format", async () => {
    const p = new UniversalProvider();
    await expect(p.get("invalid")).rejects.toThrow("Invalid specifier");
  });

  it("throws on unknown provider", async () => {
    const p = new UniversalProvider();
    await expect(p.model("unknown", "model")).rejects.toThrow(
      'Unknown provider "unknown"'
    );
  });

  it("caches provider factories", async () => {
    const p = new UniversalProvider();
    const m1 = await p.model("openai", "gpt-5.2");
    const m2 = await p.model("openai", "gpt-5.2-mini");
    expect((m1 as any).via).toBe("chat");
    expect((m2 as any).via).toBe("chat");
  });

  it("supports custom providers", async () => {
    vi.doMock("custom-ai-sdk", () => ({
      createCustom: vi.fn((config: any) => {
        return (modelId: string) => ({ modelId, provider: "custom" });
      }),
    }));

    const p = new UniversalProvider({
      customProviders: { custom: "custom-ai-sdk" },
    });
    expect(p.listProviders()).toContain("custom");
  });

  it("checks provider availability", async () => {
    const p = new UniversalProvider();
    const openaiAvailable = await p.isAvailable("openai");
    expect(openaiAvailable).toBe(true);

    const unknownAvailable = await p.isAvailable("nonexistent");
    expect(unknownAvailable).toBe(false);
  });

  it("discovers installed providers", async () => {
    const p = new UniversalProvider();
    const installed = await p.discoverInstalled();
    expect(installed).toContain("openai");
    expect(installed).toContain("anthropic");
  });

  it("passes defaults to provider factory", async () => {
    const p = new UniversalProvider({
      defaults: { apiKey: "test-key" },
    });
    const model = await p.model("openai", "gpt-5.2");
    expect((model as any).apiKey).toBe("test-key");
  });

  it("handles specifiers with colons in model name", async () => {
    const p = new UniversalProvider();
    const model = await p.get("openai:ft:gpt-5.2:custom");
    expect((model as any).modelId).toBe("ft:gpt-5.2:custom");
  });
});
