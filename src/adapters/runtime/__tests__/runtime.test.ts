import { describe, expect, it, vi } from "vitest";
import { NodeRuntimeAdapter } from "../node-runtime.adapter.js";
import { detectRuntimeName, createRuntimeAdapter } from "../detect-runtime.js";

describe("NodeRuntimeAdapter", () => {
  const adapter = new NodeRuntimeAdapter();

  it("randomUUID returns a valid UUID v4", () => {
    const uuid = adapter.randomUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("randomUUID returns unique values", () => {
    const a = adapter.randomUUID();
    const b = adapter.randomUUID();
    expect(a).not.toBe(b);
  });

  it("fetch is functional", async () => {
    // Just verify the method exists and is callable
    expect(typeof adapter.fetch).toBe("function");
  });

  it("getEnv reads process.env", () => {
    process.env.__RUNTIME_TEST_VAR__ = "hello";
    expect(adapter.getEnv("__RUNTIME_TEST_VAR__")).toBe("hello");
    delete process.env.__RUNTIME_TEST_VAR__;
  });

  it("getEnv returns undefined for missing vars", () => {
    expect(adapter.getEnv("__NONEXISTENT_VAR_12345__")).toBeUndefined();
  });

  it("setTimeout fires callback", async () => {
    const fn = vi.fn();
    adapter.setTimeout(fn, 10);
    await new Promise((r) => globalThis.setTimeout(r, 50));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("setTimeout can be cleared", async () => {
    const fn = vi.fn();
    const handle = adapter.setTimeout(fn, 50);
    handle.clear();
    await new Promise((r) => globalThis.setTimeout(r, 100));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("detectRuntimeName", () => {
  it('returns "node" in test environment', () => {
    expect(detectRuntimeName()).toBe("node");
  });
});

describe("createRuntimeAdapter", () => {
  it("returns NodeRuntimeAdapter by default", () => {
    const adapter = createRuntimeAdapter();
    expect(adapter).toBeInstanceOf(NodeRuntimeAdapter);
  });

  it("returns NodeRuntimeAdapter for explicit node", () => {
    const adapter = createRuntimeAdapter("node");
    expect(adapter).toBeInstanceOf(NodeRuntimeAdapter);
  });

  it("returns NodeRuntimeAdapter for unknown (fallback)", () => {
    const adapter = createRuntimeAdapter("unknown");
    expect(adapter).toBeInstanceOf(NodeRuntimeAdapter);
  });
});
