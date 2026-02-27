// =============================================================================
// E2B Sandbox + Factory Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { E2BSandboxAdapter } from "../e2b.adapter.js";
import { createSandbox } from "../factory.js";
import { LocalShellSandboxAdapter } from "../local-shell.adapter.js";

// =============================================================================
// E2B Adapter Tests (mocked SDK)
// =============================================================================

describe("E2BSandboxAdapter", () => {
  it("isAvailable returns false without SDK or API key", async () => {
    const adapter = new E2BSandboxAdapter();
    // Without @e2b/code-interpreter installed, should return false
    const available = await adapter.isAvailable();
    expect(available).toBe(false);
  });

  it("execute throws meaningful error without SDK", async () => {
    const adapter = new E2BSandboxAdapter();
    const result = await adapter.execute("echo hello");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("E2B");
  });

  it("cleanup is safe when no sandbox is running", async () => {
    const adapter = new E2BSandboxAdapter();
    await expect(adapter.cleanup()).resolves.toBeUndefined();
  });

  it("constructor accepts custom config", () => {
    const adapter = new E2BSandboxAdapter({
      apiKey: "test-key",
      template: "python",
      sandboxTimeoutMs: 60_000,
    });
    expect(adapter).toBeDefined();
  });
});

// =============================================================================
// Factory Tests
// =============================================================================

describe("createSandbox", () => {
  const originalEnv = process.env.E2B_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.E2B_API_KEY = originalEnv;
    } else {
      delete process.env.E2B_API_KEY;
    }
  });

  it("returns LocalShellSandboxAdapter by default (no E2B key)", () => {
    delete process.env.E2B_API_KEY;
    const sandbox = createSandbox();
    expect(sandbox).toBeInstanceOf(LocalShellSandboxAdapter);
  });

  it("returns E2BSandboxAdapter when type=e2b", () => {
    const sandbox = createSandbox({ type: "e2b" });
    expect(sandbox).toBeInstanceOf(E2BSandboxAdapter);
  });

  it("returns LocalShellSandboxAdapter when type=local", () => {
    const sandbox = createSandbox({ type: "local" });
    expect(sandbox).toBeInstanceOf(LocalShellSandboxAdapter);
  });

  it("returns E2BSandboxAdapter when E2B_API_KEY is set (auto)", () => {
    process.env.E2B_API_KEY = "test-key";
    const sandbox = createSandbox();
    expect(sandbox).toBeInstanceOf(E2BSandboxAdapter);
  });

  it("returns E2BSandboxAdapter when e2b config has apiKey (auto)", () => {
    delete process.env.E2B_API_KEY;
    const sandbox = createSandbox({ e2b: { apiKey: "explicit-key" } });
    expect(sandbox).toBeInstanceOf(E2BSandboxAdapter);
  });

  it("returns LocalShellSandboxAdapter when auto and no E2B key", () => {
    delete process.env.E2B_API_KEY;
    const sandbox = createSandbox({ type: "auto" });
    expect(sandbox).toBeInstanceOf(LocalShellSandboxAdapter);
  });
});
