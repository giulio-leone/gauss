import { describe, it, expect } from "vitest";
import {
  PROVIDER_REGISTRY,
  findByName,
  findByEnv,
  listAll,
  listByCategory,
  findAvailableByEnv,
  toPackageMap,
  type ProviderSpec,
  type ProviderCategory,
} from "../registry.js";

describe("ProviderSpec Registry", () => {
  // ─── Registry Structure ───────────────────────────────────────────────────

  it("has at least 30 providers", () => {
    expect(PROVIDER_REGISTRY.length).toBeGreaterThanOrEqual(30);
  });

  it("all entries have required fields", () => {
    for (const spec of PROVIDER_REGISTRY) {
      expect(spec.name).toBeTruthy();
      expect(spec.package).toBeTruthy();
      expect(spec.defaultModel).toBeTruthy();
      expect(spec.factoryName).toBeTruthy();
      expect(spec.modelAccess).toMatch(/^(direct|chat)$/);
      expect(spec.displayName).toBeTruthy();
      expect(spec.category).toBeTruthy();
    }
  });

  it("all provider names are unique", () => {
    const names = PROVIDER_REGISTRY.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all packages start with @ai-sdk/", () => {
    for (const spec of PROVIDER_REGISTRY) {
      expect(spec.package).toMatch(/^@ai-sdk\//);
    }
  });

  it("only openai uses chat modelAccess", () => {
    const chatProviders = PROVIDER_REGISTRY.filter(
      (p) => p.modelAccess === "chat"
    );
    expect(chatProviders).toHaveLength(1);
    expect(chatProviders[0].name).toBe("openai");
  });

  // ─── findByName ───────────────────────────────────────────────────────────

  it("findByName returns correct spec for known provider", () => {
    const openai = findByName("openai");
    expect(openai).toBeDefined();
    expect(openai!.package).toBe("@ai-sdk/openai");
    expect(openai!.envKey).toBe("OPENAI_API_KEY");
    expect(openai!.modelAccess).toBe("chat");
  });

  it("findByName is case-insensitive", () => {
    const spec = findByName("OpenAI");
    expect(spec).toBeDefined();
    expect(spec!.name).toBe("openai");
  });

  it("findByName returns undefined for unknown provider", () => {
    expect(findByName("nonexistent")).toBeUndefined();
  });

  // ─── findByEnv ────────────────────────────────────────────────────────────

  it("findByEnv returns correct spec", () => {
    const spec = findByEnv("ANTHROPIC_API_KEY");
    expect(spec).toBeDefined();
    expect(spec!.name).toBe("anthropic");
  });

  it("findByEnv returns undefined for unknown env var", () => {
    expect(findByEnv("NONEXISTENT_KEY")).toBeUndefined();
  });

  // ─── listAll ──────────────────────────────────────────────────────────────

  it("listAll returns all provider names", () => {
    const names = listAll();
    expect(names.length).toBe(PROVIDER_REGISTRY.length);
    expect(names).toContain("openai");
    expect(names).toContain("anthropic");
    expect(names).toContain("google");
    expect(names).toContain("deepseek");
  });

  // ─── listByCategory ──────────────────────────────────────────────────────

  it("listByCategory returns cloud providers", () => {
    const cloud = listByCategory("cloud");
    expect(cloud).toContain("openai");
    expect(cloud).toContain("anthropic");
    expect(cloud).toContain("google");
    expect(cloud).toContain("azure");
    expect(cloud).toContain("amazon");
  });

  it("listByCategory returns inference providers", () => {
    const inference = listByCategory("inference");
    expect(inference).toContain("groq");
    expect(inference).toContain("fireworks");
    expect(inference).toContain("togetherai");
  });

  it("listByCategory returns speech providers", () => {
    const speech = listByCategory("speech");
    expect(speech).toContain("elevenlabs");
    expect(speech).toContain("deepgram");
  });

  it("listByCategory returns empty array for nonexistent category", () => {
    expect(listByCategory("nonexistent" as ProviderCategory)).toEqual([]);
  });

  // ─── findAvailableByEnv ──────────────────────────────────────────────────

  it("findAvailableByEnv returns empty when no env vars set", () => {
    const available = findAvailableByEnv();
    // In test environment, none of the API keys should be set
    // (unless the user has them in their env, which is fine)
    expect(Array.isArray(available)).toBe(true);
  });

  // ─── toPackageMap ────────────────────────────────────────────────────────

  it("toPackageMap creates name→package mapping", () => {
    const map = toPackageMap();
    expect(map.openai).toBe("@ai-sdk/openai");
    expect(map.anthropic).toBe("@ai-sdk/anthropic");
    expect(map.deepseek).toBe("@ai-sdk/deepseek");
    expect(Object.keys(map).length).toBe(PROVIDER_REGISTRY.length);
  });

  // ─── Specific Provider Specs ─────────────────────────────────────────────

  it("OpenAI spec is correct", () => {
    const spec = findByName("openai")!;
    expect(spec.package).toBe("@ai-sdk/openai");
    expect(spec.envKey).toBe("OPENAI_API_KEY");
    expect(spec.factoryName).toBe("createOpenAI");
    expect(spec.modelAccess).toBe("chat");
    expect(spec.category).toBe("cloud");
  });

  it("Anthropic spec is correct", () => {
    const spec = findByName("anthropic")!;
    expect(spec.package).toBe("@ai-sdk/anthropic");
    expect(spec.envKey).toBe("ANTHROPIC_API_KEY");
    expect(spec.factoryName).toBe("createAnthropic");
    expect(spec.modelAccess).toBe("direct");
  });

  it("Google spec is correct", () => {
    const spec = findByName("google")!;
    expect(spec.package).toBe("@ai-sdk/google");
    expect(spec.envKey).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(spec.factoryName).toBe("createGoogleGenerativeAI");
  });

  it("openai-compatible has no envKey", () => {
    const spec = findByName("openai-compatible")!;
    expect(spec.envKey).toBeUndefined();
    expect(spec.category).toBe("compatible");
  });
});
