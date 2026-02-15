import { describe, expect, it, vi } from "vitest";
import { NodeRuntimeAdapter } from "../node-runtime.adapter.js";
import { DenoRuntimeAdapter } from "../deno-runtime.adapter.js";
import { BunRuntimeAdapter } from "../bun-runtime.adapter.js";
import { EdgeRuntimeAdapter } from "../edge-runtime.adapter.js";
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

describe("DenoRuntimeAdapter", () => {
  const adapter = new DenoRuntimeAdapter();

  it('has name "deno"', () => {
    expect(adapter.name).toBe("deno");
  });

  it("randomUUID returns a valid UUID", () => {
    expect(adapter.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("getEnv returns undefined when Deno global is absent", () => {
    expect(adapter.getEnv("HOME")).toBeUndefined();
  });

  it("getEnv reads from Deno.env.get when available", () => {
    (globalThis as any).Deno = { env: { get: (k: string) => k === "TEST" ? "deno-val" : undefined } };
    expect(adapter.getEnv("TEST")).toBe("deno-val");
    delete (globalThis as any).Deno;
  });

  it("setTimeout fires and can be cleared", async () => {
    const fn = vi.fn();
    const handle = adapter.setTimeout(fn, 10);
    await new Promise((r) => globalThis.setTimeout(r, 50));
    expect(fn).toHaveBeenCalledOnce();

    const fn2 = vi.fn();
    const handle2 = adapter.setTimeout(fn2, 50);
    handle2.clear();
    await new Promise((r) => globalThis.setTimeout(r, 100));
    expect(fn2).not.toHaveBeenCalled();
  });
});

describe("BunRuntimeAdapter", () => {
  const adapter = new BunRuntimeAdapter();

  it('has name "bun"', () => {
    expect(adapter.name).toBe("bun");
  });

  it("randomUUID returns a valid UUID", () => {
    expect(adapter.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("getEnv reads process.env (Bun is Node-compatible)", () => {
    process.env.__BUN_TEST__ = "bun-val";
    expect(adapter.getEnv("__BUN_TEST__")).toBe("bun-val");
    delete process.env.__BUN_TEST__;
  });

  it("getEnv returns undefined for missing vars", () => {
    expect(adapter.getEnv("__NONEXISTENT__")).toBeUndefined();
  });
});

describe("EdgeRuntimeAdapter", () => {
  const adapter = new EdgeRuntimeAdapter();

  it('has name "edge"', () => {
    expect(adapter.name).toBe("edge");
  });

  it("randomUUID returns a valid UUID", () => {
    expect(adapter.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("getEnv always returns undefined", () => {
    expect(adapter.getEnv("HOME")).toBeUndefined();
    expect(adapter.getEnv("PATH")).toBeUndefined();
  });

  it("fetch is functional", () => {
    expect(typeof adapter.fetch).toBe("function");
  });

  it("setTimeout fires and can be cleared", async () => {
    const fn = vi.fn();
    adapter.setTimeout(fn, 10);
    await new Promise((r) => globalThis.setTimeout(r, 50));
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("detectRuntimeName", () => {
  it('returns "node" in test environment', () => {
    expect(detectRuntimeName()).toBe("node");
  });
});

describe("createRuntimeAdapter", () => {
  it("returns NodeRuntimeAdapter by default", () => {
    expect(createRuntimeAdapter()).toBeInstanceOf(NodeRuntimeAdapter);
  });

  it("returns NodeRuntimeAdapter for explicit node", () => {
    expect(createRuntimeAdapter("node")).toBeInstanceOf(NodeRuntimeAdapter);
  });

  it("returns DenoRuntimeAdapter for deno", () => {
    expect(createRuntimeAdapter("deno")).toBeInstanceOf(DenoRuntimeAdapter);
  });

  it("returns BunRuntimeAdapter for bun", () => {
    expect(createRuntimeAdapter("bun")).toBeInstanceOf(BunRuntimeAdapter);
  });

  it("returns EdgeRuntimeAdapter for edge", () => {
    expect(createRuntimeAdapter("edge")).toBeInstanceOf(EdgeRuntimeAdapter);
  });

  it("returns NodeRuntimeAdapter for unknown (fallback)", () => {
    expect(createRuntimeAdapter("unknown")).toBeInstanceOf(NodeRuntimeAdapter);
  });
});

describe("createRuntimeAdapterAsync", () => {
  it("returns NodeRuntimeAdapter by default", async () => {
    expect(await createRuntimeAdapterAsync()).toBeInstanceOf(NodeRuntimeAdapter);
  });

  it("returns NodeRuntimeAdapter for explicit node", async () => {
    expect(await createRuntimeAdapterAsync("node")).toBeInstanceOf(NodeRuntimeAdapter);
  });

  it("returns DenoRuntimeAdapter for deno", async () => {
    expect(await createRuntimeAdapterAsync("deno")).toBeInstanceOf(DenoRuntimeAdapter);
  });

  it("returns BunRuntimeAdapter for bun", async () => {
    expect(await createRuntimeAdapterAsync("bun")).toBeInstanceOf(BunRuntimeAdapter);
  });

  it("returns EdgeRuntimeAdapter for edge", async () => {
    expect(await createRuntimeAdapterAsync("edge")).toBeInstanceOf(EdgeRuntimeAdapter);
  });

  it("returns NodeRuntimeAdapter for unknown (fallback)", async () => {
    expect(await createRuntimeAdapterAsync("unknown")).toBeInstanceOf(NodeRuntimeAdapter);
  });
});

describe("RuntimePort interface compliance", () => {
  const adapters = [
    { Adapter: NodeRuntimeAdapter, expectedName: "node" as const },
    { Adapter: DenoRuntimeAdapter, expectedName: "deno" as const },
    { Adapter: BunRuntimeAdapter, expectedName: "bun" as const },
    { Adapter: EdgeRuntimeAdapter, expectedName: "edge" as const },
  ];

  for (const { Adapter, expectedName } of adapters) {
    describe(Adapter.name, () => {
      const adapter = new Adapter();

      it(`has name "${expectedName}"`, () => {
        expect(adapter.name).toBe(expectedName);
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
  }
});
