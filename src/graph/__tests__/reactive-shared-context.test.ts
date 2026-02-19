import { describe, it, expect, vi } from "vitest";

import {
  SharedContext,
  VersionConflictError,
  type ContextChange,
} from "../shared-context.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";

// =============================================================================
// Helpers
// =============================================================================

function makeCtx(ns?: string) {
  return new SharedContext(new VirtualFilesystem(), ns);
}

// =============================================================================
// Backward-compatibility sanity checks
// =============================================================================

describe("SharedContext — backward compat", () => {
  it("set/get round-trip still works", async () => {
    const ctx = makeCtx();
    await ctx.set("k", { a: 1 });
    expect(await ctx.get<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("get returns null for missing key", async () => {
    expect(await makeCtx().get("nope")).toBeNull();
  });

  it("delete removes key", async () => {
    const ctx = makeCtx();
    await ctx.set("k", 1);
    await ctx.delete("k");
    expect(await ctx.get("k")).toBeNull();
  });

  it("list returns all keys", async () => {
    const ctx = makeCtx();
    await ctx.set("a", 1);
    await ctx.set("b", 2);
    expect((await ctx.list()).sort()).toEqual(["a", "b"]);
  });

  it("setNodeResult / getNodeResult", async () => {
    const ctx = makeCtx();
    await ctx.setNodeResult("n1", "out");
    expect(await ctx.getNodeResult("n1")).toBe("out");
  });
});

// =============================================================================
// Watchers
// =============================================================================

describe("SharedContext — watchers", () => {
  it("fires handler on matching key set", async () => {
    const ctx = makeCtx();
    const changes: ContextChange[] = [];
    ctx.watch("color", (c) => changes.push(c));

    await ctx.set("color", "red");

    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBe("color");
    expect(changes[0].oldValue).toBeNull();
    expect(changes[0].newValue).toBe("red");
    expect(changes[0].version).toBe(1);
    expect(typeof changes[0].timestamp).toBe("number");
  });

  it("does NOT fire handler for a different key", async () => {
    const ctx = makeCtx();
    const handler = vi.fn();
    ctx.watch("color", handler);

    await ctx.set("size", 42);
    expect(handler).not.toHaveBeenCalled();
  });

  it("wildcard '*' catches all changes", async () => {
    const ctx = makeCtx();
    const changes: ContextChange[] = [];
    ctx.watch("*", (c) => changes.push(c));

    await ctx.set("a", 1);
    await ctx.set("b", 2);

    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.key)).toEqual(["a", "b"]);
  });

  it("unsubscribe stops further notifications", async () => {
    const ctx = makeCtx();
    const handler = vi.fn();
    const unsub = ctx.watch("x", handler);

    await ctx.set("x", 1);
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    await ctx.set("x", 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("set provides old and new values", async () => {
    const ctx = makeCtx();
    await ctx.set("k", "old");

    const changes: ContextChange[] = [];
    ctx.watch("k", (c) => changes.push(c));
    await ctx.set("k", "new");

    expect(changes[0].oldValue).toBe("old");
    expect(changes[0].newValue).toBe("new");
  });

  it("delete triggers watcher with newValue undefined", async () => {
    const ctx = makeCtx();
    await ctx.set("k", "val");

    const changes: ContextChange[] = [];
    ctx.watch("k", (c) => changes.push(c));
    await ctx.delete("k");

    expect(changes).toHaveLength(1);
    expect(changes[0].oldValue).toBe("val");
    expect(changes[0].newValue).toBeUndefined();
  });
});

// =============================================================================
// Versioning
// =============================================================================

describe("SharedContext — versioning", () => {
  it("getVersioned returns value + version", async () => {
    const ctx = makeCtx();
    await ctx.set("k", "hello");
    const v = await ctx.getVersioned<string>("k");
    expect(v).toEqual({ value: "hello", version: 1 });
  });

  it("getVersioned returns null for missing key", async () => {
    expect(await makeCtx().getVersioned("nope")).toBeNull();
  });

  it("version increments on each set", async () => {
    const ctx = makeCtx();
    await ctx.set("k", 1);
    await ctx.set("k", 2);
    await ctx.set("k", 3);
    const v = await ctx.getVersioned<number>("k");
    expect(v!.version).toBe(3);
  });

  it("setVersioned succeeds with correct expectedVersion", async () => {
    const ctx = makeCtx();
    await ctx.set("k", "a");
    await ctx.setVersioned("k", "b", 1);
    expect(await ctx.get("k")).toBe("b");
  });

  it("setVersioned throws VersionConflictError on mismatch", async () => {
    const ctx = makeCtx();
    await ctx.set("k", "a"); // version 1

    await expect(ctx.setVersioned("k", "b", 0)).rejects.toThrow(
      VersionConflictError,
    );
  });

  it("setVersioned on new key expects version 0", async () => {
    const ctx = makeCtx();
    await ctx.setVersioned("newkey", "val", 0);
    expect(await ctx.get("newkey")).toBe("val");
  });
});

// =============================================================================
// CRDT Merge
// =============================================================================

describe("SharedContext — CRDT merge", () => {
  it("default merge is Last-Writer-Wins", async () => {
    const ctx = makeCtx();
    await ctx.set("k", "old");
    await ctx.merge("k", "new");
    expect(await ctx.get("k")).toBe("new");
  });

  it("merge on missing key passes null as old", async () => {
    const ctx = makeCtx();
    await ctx.merge("k", 10, (old, nw) => (old ?? 0) + nw);
    expect(await ctx.get("k")).toBe(10);
  });

  it("custom mergeFn combines old and new", async () => {
    const ctx = makeCtx();
    await ctx.set("counter", 5);
    await ctx.merge<number>("counter", 3, (old, nw) => (old ?? 0) + nw);
    expect(await ctx.get("counter")).toBe(8);
  });

  it("merge triggers watchers", async () => {
    const ctx = makeCtx();
    await ctx.set("k", 1);

    const changes: ContextChange[] = [];
    ctx.watch("k", (c) => changes.push(c));
    await ctx.merge<number>("k", 2, (old, nw) => (old ?? 0) + nw);

    expect(changes).toHaveLength(1);
    expect(changes[0].newValue).toBe(3);
  });

  it("merge with array union", async () => {
    const ctx = makeCtx();
    await ctx.set("tags", ["a", "b"]);
    await ctx.merge<string[]>("tags", ["b", "c"], (old, nw) => [
      ...new Set([...(old ?? []), ...nw]),
    ]);
    expect(await ctx.get("tags")).toEqual(["a", "b", "c"]);
  });
});

// =============================================================================
// Scoping
// =============================================================================

describe("SharedContext — scoping", () => {
  it("scoped context uses sub-namespace", async () => {
    const fs = new VirtualFilesystem();
    const root = new SharedContext(fs);
    const child = root.createScoped("agent-1");

    await child.set("result", "ok");

    // root should NOT see it under "result" — different namespace
    expect(await root.get("result")).toBeNull();
    // but under the full scoped path it is accessible from root
    expect(await root.get("agent-1/result")).toBe("ok");
  });

  it("scoped watcher bubbles to parent", async () => {
    const fs = new VirtualFilesystem();
    const root = new SharedContext(fs);
    const child = root.createScoped("sub");

    const rootChanges: ContextChange[] = [];
    root.watch("*", (c) => rootChanges.push(c));

    await child.set("x", 42);

    expect(rootChanges).toHaveLength(1);
    expect(rootChanges[0].key).toBe("x");
    expect(rootChanges[0].newValue).toBe(42);
  });

  it("nested scopes bubble through the chain", async () => {
    const fs = new VirtualFilesystem();
    const root = new SharedContext(fs);
    const mid = root.createScoped("a");
    const leaf = mid.createScoped("b");

    const rootChanges: ContextChange[] = [];
    root.watch("*", (c) => rootChanges.push(c));

    await leaf.set("val", 1);

    expect(rootChanges).toHaveLength(1);
  });

  it("scoped context has independent versioning", async () => {
    const fs = new VirtualFilesystem();
    const root = new SharedContext(fs);
    const child = root.createScoped("s");

    await root.set("k", 1);
    await root.set("k", 2); // root version = 2

    await child.set("k", "a"); // child version = 1

    expect((await root.getVersioned("k"))!.version).toBe(2);
    expect((await child.getVersioned("k"))!.version).toBe(1);
  });
});
