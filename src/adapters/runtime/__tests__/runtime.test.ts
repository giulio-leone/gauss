import { describe, expect, it, vi } from "vitest";
import { NodeRuntimeAdapter } from "../node-runtime.adapter.js";
import { detectRuntimeName, createRuntimeAdapter, createRuntimeAdapterAsync } from "../detect-runtime.js";

describe("NodeRuntimeAdapter", () => {
  const adapter = new NodeRuntimeAdapter();

  it('has name "node"', () => {
    expect(adapter.name).toBe("node");
  });

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
  it('always returns "node"', () => {
    expect(detectRuntimeName()).toBe("node");
  });
});

describe("createRuntimeAdapter", () => {
  it("returns NodeRuntimeAdapter", () => {
    expect(createRuntimeAdapter()).toBeInstanceOf(NodeRuntimeAdapter);
  });
});

describe("createRuntimeAdapterAsync", () => {
  it("returns NodeRuntimeAdapter", async () => {
    expect(await createRuntimeAdapterAsync()).toBeInstanceOf(NodeRuntimeAdapter);
  });
});

describe("RuntimePort interface compliance", () => {
  const adapter = new NodeRuntimeAdapter();

  it('has name "node"', () => {
    expect(adapter.name).toBe("node");
  });

  it("implements randomUUID", () => {
    expect(typeof adapter.randomUUID).toBe("function");
    expect(adapter.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("implements fetch", () => {
    expect(typeof adapter.fetch).toBe("function");
  });

  it("implements getEnv", () => {
    expect(typeof adapter.getEnv).toBe("function");
  });

  it("implements setTimeout", () => {
    expect(typeof adapter.setTimeout).toBe("function");
  });
});
