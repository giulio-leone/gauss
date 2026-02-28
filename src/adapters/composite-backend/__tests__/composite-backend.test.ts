import { describe, it, expect } from "vitest";
import {
  CompositeBackend,
  InMemoryKVBackend,
} from "../composite-backend.js";

describe("CompositeBackend", () => {
  it("routes to default backend when no prefix matches", async () => {
    const defaultBE = new InMemoryKVBackend();
    const backend = new CompositeBackend(defaultBE);

    await backend.set("key1", "value1");
    expect(await backend.get("key1")).toBe("value1");
  });

  it("routes to correct backend based on prefix", async () => {
    const defaultBE = new InMemoryKVBackend();
    const cacheBE = new InMemoryKVBackend();
    const blobBE = new InMemoryKVBackend();

    const backend = new CompositeBackend(defaultBE, [
      { prefix: "cache/", backend: cacheBE },
      { prefix: "blob/", backend: blobBE },
    ]);

    await backend.set("cache/user:1", { name: "Alice" });
    await backend.set("blob/file.png", "binary-data");
    await backend.set("other/key", "default");

    // Check routing
    expect(await cacheBE.get("cache/user:1")).toEqual({ name: "Alice" });
    expect(await blobBE.get("blob/file.png")).toBe("binary-data");
    expect(await defaultBE.get("other/key")).toBe("default");

    // Composite reads also work
    expect(await backend.get("cache/user:1")).toEqual({ name: "Alice" });
    expect(await backend.get("blob/file.png")).toBe("binary-data");
    expect(await backend.get("other/key")).toBe("default");
  });

  it("returns null for missing keys", async () => {
    const backend = new CompositeBackend(new InMemoryKVBackend());
    expect(await backend.get("nonexistent")).toBeNull();
  });

  it("deletes from correct backend", async () => {
    const cacheBE = new InMemoryKVBackend();
    const backend = new CompositeBackend(new InMemoryKVBackend(), [
      { prefix: "cache/", backend: cacheBE },
    ]);

    await backend.set("cache/temp", "data");
    expect(await backend.get("cache/temp")).toBe("data");

    const deleted = await backend.delete("cache/temp");
    expect(deleted).toBe(true);
    expect(await backend.get("cache/temp")).toBeNull();
  });

  it("lists keys from specific backend with prefix", async () => {
    const cacheBE = new InMemoryKVBackend();
    const backend = new CompositeBackend(new InMemoryKVBackend(), [
      { prefix: "cache/", backend: cacheBE },
    ]);

    await backend.set("cache/a", 1);
    await backend.set("cache/b", 2);

    const keys = await backend.list("cache/");
    expect(keys).toEqual(expect.arrayContaining(["cache/a", "cache/b"]));
    expect(keys).toHaveLength(2);
  });

  it("lists all keys from all backends without prefix", async () => {
    const defaultBE = new InMemoryKVBackend();
    const cacheBE = new InMemoryKVBackend();

    const backend = new CompositeBackend(defaultBE, [
      { prefix: "cache/", backend: cacheBE },
    ]);

    await backend.set("cache/x", 1);
    await backend.set("other", 2);

    const keys = await backend.list();
    expect(keys).toEqual(expect.arrayContaining(["cache/x", "other"]));
  });

  it("longer prefix wins over shorter", async () => {
    const generalBE = new InMemoryKVBackend();
    const specificBE = new InMemoryKVBackend();

    const backend = new CompositeBackend(new InMemoryKVBackend(), [
      { prefix: "data/", backend: generalBE },
      { prefix: "data/special/", backend: specificBE },
    ]);

    await backend.set("data/special/item", "specific");
    await backend.set("data/normal", "general");

    expect(await specificBE.get("data/special/item")).toBe("specific");
    expect(await generalBE.get("data/normal")).toBe("general");
  });
});

describe("InMemoryKVBackend", () => {
  it("basic CRUD operations", async () => {
    const be = new InMemoryKVBackend();

    await be.set("k1", "v1");
    expect(await be.get("k1")).toBe("v1");

    await be.set("k1", "v2");
    expect(await be.get("k1")).toBe("v2");

    expect(await be.delete("k1")).toBe(true);
    expect(await be.get("k1")).toBeNull();
    expect(await be.delete("k1")).toBe(false);
  });

  it("list with and without prefix", async () => {
    const be = new InMemoryKVBackend();
    await be.set("a/1", 1);
    await be.set("a/2", 2);
    await be.set("b/1", 3);

    expect(await be.list("a/")).toEqual(["a/1", "a/2"]);
    expect(await be.list()).toHaveLength(3);
  });
});
