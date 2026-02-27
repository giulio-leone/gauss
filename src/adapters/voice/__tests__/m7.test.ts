import { describe, it, expect } from "vitest";
import { InMemoryVoiceAdapter } from "../inmemory.adapter.js";
import { InMemoryDatasetsAdapter } from "../../datasets/inmemory.adapter.js";
import { InMemoryDeployerAdapter } from "../../deployer/inmemory.adapter.js";
import type { VoiceEvent } from "../../../ports/voice.port.js";

// ============= Voice Adapter Tests =============

describe("InMemoryVoiceAdapter", () => {
  it("speak returns audio and emits events", async () => {
    const adapter = new InMemoryVoiceAdapter();
    const events: VoiceEvent[] = [];
    adapter.on(e => events.push(e));

    const audio = await adapter.speak("hello world");
    expect(audio).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(audio)).toBe("hello world");
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("speaking");
    expect(events[1].type).toBe("audio");
  });

  it("listen returns transcript and emits events", async () => {
    const adapter = new InMemoryVoiceAdapter({
      listenHandler: () => "recognized text",
    });
    const events: VoiceEvent[] = [];
    adapter.on(e => events.push(e));

    const text = await adapter.listen(new Uint8Array(10));
    expect(text).toBe("recognized text");
    expect(events[0].type).toBe("listening");
    expect(events[1].type).toBe("transcript");
  });

  it("connect/disconnect lifecycle", async () => {
    const adapter = new InMemoryVoiceAdapter();
    const events: VoiceEvent[] = [];
    adapter.on(e => events.push(e));

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    expect(events[0].type).toBe("connected");

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
    expect(events[1].type).toBe("disconnected");
  });

  it("unsubscribe stops events", async () => {
    const adapter = new InMemoryVoiceAdapter();
    const events: VoiceEvent[] = [];
    const unsub = adapter.on(e => events.push(e));
    await adapter.speak("one");
    unsub();
    await adapter.speak("two");
    expect(events).toHaveLength(2); // Only events from "one"
  });

  it("custom speak handler", async () => {
    const adapter = new InMemoryVoiceAdapter({
      speakHandler: () => new Uint8Array([1, 2, 3]),
    });
    const audio = await adapter.speak("test");
    expect(audio).toEqual(new Uint8Array([1, 2, 3]));
  });
});

// ============= Datasets Adapter Tests =============

describe("InMemoryDatasetsAdapter", () => {
  it("creates and lists datasets", async () => {
    const ds = new InMemoryDatasetsAdapter();
    const info = await ds.create("test-ds");
    expect(info.name).toBe("test-ds");
    expect(info.version).toBe(1);
    const list = await ds.list();
    expect(list).toHaveLength(1);
  });

  it("prevents duplicate creation", async () => {
    const ds = new InMemoryDatasetsAdapter();
    await ds.create("dup");
    await expect(ds.create("dup")).rejects.toThrow("already exists");
  });

  it("inserts and queries entries", async () => {
    const ds = new InMemoryDatasetsAdapter();
    await ds.create("myds");
    const ids = await ds.insert("myds", [
      { data: { name: "Alice", age: 30 } },
      { data: { name: "Bob", age: 25 } },
    ]);
    expect(ids).toHaveLength(2);
    const all = await ds.query("myds");
    expect(all).toHaveLength(2);
  });

  it("filters entries", async () => {
    const ds = new InMemoryDatasetsAdapter();
    await ds.create("filter-ds");
    await ds.insert("filter-ds", [
      { data: { type: "A", val: 1 } },
      { data: { type: "B", val: 2 } },
      { data: { type: "A", val: 3 } },
    ]);
    const results = await ds.query("filter-ds", { filter: { type: "A" } });
    expect(results).toHaveLength(2);
  });

  it("sorts entries", async () => {
    const ds = new InMemoryDatasetsAdapter();
    await ds.create("sort-ds");
    await ds.insert("sort-ds", [
      { data: { score: 3 } },
      { data: { score: 1 } },
      { data: { score: 2 } },
    ]);
    const results = await ds.query("sort-ds", { sort: { field: "score", order: "asc" } });
    expect(results.map(r => r.data.score)).toEqual([1, 2, 3]);
  });

  it("paginates with offset/limit", async () => {
    const ds = new InMemoryDatasetsAdapter();
    await ds.create("page-ds");
    await ds.insert("page-ds", [
      { data: { i: 0 } }, { data: { i: 1 } }, { data: { i: 2 } }, { data: { i: 3 } },
    ]);
    const page = await ds.query("page-ds", { offset: 1, limit: 2 });
    expect(page).toHaveLength(2);
  });

  it("removes dataset", async () => {
    const ds = new InMemoryDatasetsAdapter();
    await ds.create("rm-ds");
    await ds.remove("rm-ds");
    const list = await ds.list();
    expect(list).toHaveLength(0);
  });

  it("versions dataset", async () => {
    const ds = new InMemoryDatasetsAdapter();
    await ds.create("ver-ds");
    const v = await ds.version("ver-ds");
    expect(v).toBe(2);
    const info = await ds.info("ver-ds");
    expect(info?.version).toBe(2);
  });

  it("info returns undefined for missing dataset", async () => {
    const ds = new InMemoryDatasetsAdapter();
    expect(await ds.info("nope")).toBeUndefined();
  });
});

// ============= Deployer Adapter Tests =============

describe("InMemoryDeployerAdapter", () => {
  it("builds an artifact", async () => {
    const deployer = new InMemoryDeployerAdapter();
    const result = await deployer.build({ name: "my-app", entrypoint: "index.ts" });
    expect(result.artifactPath).toContain("my-app");
    expect(result.size).toBeGreaterThan(0);
  });

  it("deploys and returns deployment info", async () => {
    const deployer = new InMemoryDeployerAdapter();
    const info = await deployer.deploy({ name: "my-app", entrypoint: "index.ts" });
    expect(info.status).toBe("ready");
    expect(info.url).toContain("my-app");
    expect(info.version).toBe(1);
  });

  it("increments version on subsequent deploys", async () => {
    const deployer = new InMemoryDeployerAdapter();
    await deployer.deploy({ name: "my-app", entrypoint: "index.ts" });
    const info2 = await deployer.deploy({ name: "my-app", entrypoint: "index.ts" });
    expect(info2.version).toBe(2);
  });

  it("gets deployment status", async () => {
    const deployer = new InMemoryDeployerAdapter();
    const info = await deployer.deploy({ name: "my-app", entrypoint: "index.ts" });
    const status = await deployer.status(info.id);
    expect(status?.status).toBe("ready");
  });

  it("returns undefined for missing deployment", async () => {
    const deployer = new InMemoryDeployerAdapter();
    expect(await deployer.status("nope")).toBeUndefined();
  });

  it("rollbacks deployment", async () => {
    const deployer = new InMemoryDeployerAdapter();
    const info = await deployer.deploy({ name: "my-app", entrypoint: "index.ts" });
    const rolled = await deployer.rollback(info.id);
    expect(rolled.status).toBe("rolled_back");
  });

  it("lists deployments", async () => {
    const deployer = new InMemoryDeployerAdapter();
    await deployer.deploy({ name: "app-a", entrypoint: "a.ts" });
    await deployer.deploy({ name: "app-b", entrypoint: "b.ts" });
    expect(await deployer.list()).toHaveLength(2);
    expect(await deployer.list("app-a")).toHaveLength(1);
  });

  it("removes deployment", async () => {
    const deployer = new InMemoryDeployerAdapter();
    const info = await deployer.deploy({ name: "rm-app", entrypoint: "index.ts" });
    await deployer.remove(info.id);
    expect(await deployer.list()).toHaveLength(0);
  });
});
