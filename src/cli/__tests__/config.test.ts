// =============================================================================
// Tests — CLI Config (.gaussflowrc management)
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;

// Mock node:os so homedir() returns our temp directory
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

describe("CLI Config", () => {
  beforeEach(async () => {
    tempDir = join(tmpdir(), `gaussflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    // Re-import to pick up new tempDir via the mock
    vi.resetModules();
  });

  afterEach(() => {
    try { unlinkSync(join(tempDir, ".gaussflowrc")); } catch {}
    try { rmdirSync(tempDir); } catch {}
  });

  it("loadConfig returns empty keys when no file exists", async () => {
    const { loadConfig } = await import("../config.js");
    const config = loadConfig();
    expect(config).toEqual({ keys: {} });
  });

  it("setKey and getKey round-trip", async () => {
    const { setKey, getKey } = await import("../config.js");
    setKey("openai", "sk-test-123");
    expect(getKey("openai")).toBe("sk-test-123");
  });

  it("deleteKey removes a key", async () => {
    const { setKey, getKey, deleteKey } = await import("../config.js");
    setKey("openai", "sk-test-123");
    expect(deleteKey("openai")).toBe(true);
    expect(getKey("openai")).toBeUndefined();
  });

  it("deleteKey returns false for non-existent key", async () => {
    const { deleteKey } = await import("../config.js");
    expect(deleteKey("nonexistent")).toBe(false);
  });

  it("listKeys returns all stored keys", async () => {
    const { setKey, listKeys } = await import("../config.js");
    setKey("openai", "sk-test-1");
    setKey("anthropic", "sk-test-2");
    const keys = listKeys();
    expect(keys).toEqual({
      openai: "sk-test-1",
      anthropic: "sk-test-2",
    });
  });

  it("saveConfig writes valid JSON to disk", async () => {
    const { saveConfig } = await import("../config.js");
    saveConfig({ keys: { openai: "sk-test" } });
    const raw = readFileSync(join(tempDir, ".gaussflowrc"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.keys.openai).toBe("sk-test");
  });

  it("resolveApiKey prefers CLI key over config", async () => {
    const { setKey, resolveApiKey } = await import("../config.js");
    setKey("openai", "sk-config");
    expect(resolveApiKey("openai", "sk-cli")).toBe("sk-cli");
  });

  it("resolveApiKey falls back to config key", async () => {
    const { setKey, resolveApiKey } = await import("../config.js");
    setKey("openai", "sk-config");
    expect(resolveApiKey("openai")).toBe("sk-config");
  });

  it("resolveApiKey falls back to env var", async () => {
    const { resolveApiKey } = await import("../config.js");
    process.env.OPENAI_API_KEY = "sk-env-test";
    try {
      expect(resolveApiKey("openai")).toBe("sk-env-test");
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("loadConfig handles malformed JSON gracefully", async () => {
    const { loadConfig } = await import("../config.js");
    writeFileSync(join(tempDir, ".gaussflowrc"), "not json", "utf-8");
    const config = loadConfig();
    expect(config).toEqual({ keys: {} });
  });

  it("setDefaultProvider and getDefaultProvider round-trip", async () => {
    const { setDefaultProvider, getDefaultProvider } = await import("../config.js");
    setDefaultProvider("anthropic");
    expect(getDefaultProvider()).toBe("anthropic");
  });

  it("setDefaultModel and getDefaultModelFromConfig round-trip", async () => {
    const { setDefaultModel, getDefaultModelFromConfig } = await import("../config.js");
    setDefaultModel("gpt-4o-mini");
    expect(getDefaultModelFromConfig()).toBe("gpt-4o-mini");
  });

  it("loadConfig preserves defaultProvider and defaultModel", async () => {
    const { saveConfig, loadConfig } = await import("../config.js");
    saveConfig({ keys: { openai: "sk-test" }, defaultProvider: "groq", defaultModel: "llama-3.3-70b-versatile" });
    const config = loadConfig();
    expect(config.defaultProvider).toBe("groq");
    expect(config.defaultModel).toBe("llama-3.3-70b-versatile");
    expect(config.keys.openai).toBe("sk-test");
  });
});
