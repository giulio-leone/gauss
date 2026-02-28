import { describe, it, expect, beforeEach } from "vitest";
import {
  detectBackend,
  hasNativeBackend,
  getBackendModule,
  resetBackendCache,
} from "../runtime/backend.js";

describe("Backend Detection", () => {
  beforeEach(() => {
    resetBackendCache();
    delete process.env["GAUSS_BACKEND"];
    delete process.env["GAUSS_NAPI_PATH"];
  });

  it("detectBackend returns a BackendInfo object", () => {
    const backend = detectBackend();
    expect(backend).toHaveProperty("type");
    expect(backend).toHaveProperty("version");
    expect(backend).toHaveProperty("module");
    expect(["napi", "none"]).toContain(backend.type);
  });

  it("caches result across calls", () => {
    const first = detectBackend();
    const second = detectBackend();
    expect(first).toBe(second);
  });

  it("resetBackendCache clears the cache", () => {
    const first = detectBackend();
    resetBackendCache();
    const second = detectBackend();
    expect(second.type).toBe(first.type);
  });

  it("hasNativeBackend returns boolean", () => {
    expect(typeof hasNativeBackend()).toBe("boolean");
  });

  it("getBackendModule returns module or null", () => {
    const backend = detectBackend();
    const mod = getBackendModule();
    if (backend.type === "none") {
      expect(mod).toBeNull();
    } else {
      expect(mod).not.toBeNull();
    }
  });

  it("GAUSS_BACKEND=napi throws if NAPI not available", () => {
    process.env["GAUSS_BACKEND"] = "napi";
    resetBackendCache();
    try {
      const backend = detectBackend();
      expect(backend.type).toBe("napi");
    } catch (e) {
      expect((e as Error).message).toContain("GAUSS_BACKEND=napi");
    }
  });

  it("falls back to none when no backend available", () => {
    resetBackendCache();
    const backend = detectBackend();
    expect(["napi", "none"]).toContain(backend.type);
  });
});
