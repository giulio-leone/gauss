// =============================================================================
// Tests: M4 — Storage Domain, Composite, Prometheus, File Learning
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStorageAdapter } from "../../../adapters/storage/inmemory.adapter.js";
import { CompositeStorageAdapter } from "../../../ports/storage-domain.port.js";
import { PrometheusMetricsAdapter } from "../../../adapters/metrics/prometheus.adapter.js";
import { FileLearningAdapter } from "../../../adapters/learning/file-learning.adapter.js";

// =============================================================================
// InMemoryStorageAdapter
// =============================================================================

describe("InMemoryStorageAdapter", () => {
  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
  });

  it("put/get round-trip", async () => {
    const record = await storage.put("agents", "a1", { name: "test" });
    expect(record.id).toBe("a1");
    expect(record.domain).toBe("agents");
    expect(record.data.name).toBe("test");

    const fetched = await storage.get("agents", "a1");
    expect(fetched).not.toBeNull();
    expect(fetched!.data.name).toBe("test");
  });

  it("returns null for unknown record", async () => {
    expect(await storage.get("agents", "unknown")).toBeNull();
  });

  it("upserts existing records", async () => {
    await storage.put("agents", "a1", { name: "v1" });
    const updated = await storage.put("agents", "a1", { name: "v2" });
    expect(updated.data.name).toBe("v2");
    expect(updated.createdAt).toBeLessThanOrEqual(updated.updatedAt);
  });

  it("delete removes record", async () => {
    await storage.put("agents", "a1", { name: "test" });
    expect(await storage.delete("agents", "a1")).toBe(true);
    expect(await storage.get("agents", "a1")).toBeNull();
  });

  it("query with filter", async () => {
    await storage.put("agents", "a1", { type: "chat" });
    await storage.put("agents", "a2", { type: "tool" });
    await storage.put("agents", "a3", { type: "chat" });

    const result = await storage.query({
      domain: "agents",
      filter: { type: "chat" },
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("query with pagination", async () => {
    for (let i = 0; i < 10; i++) {
      await storage.put("agents", `a${i}`, { idx: i });
    }

    const page1 = await storage.query({ domain: "agents", limit: 3, offset: 0 });
    expect(page1.items).toHaveLength(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.total).toBe(10);

    const page2 = await storage.query({ domain: "agents", limit: 3, offset: 9 });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it("query with orderBy", async () => {
    await storage.put("scores", "s1", { value: 30 });
    await storage.put("scores", "s2", { value: 10 });
    await storage.put("scores", "s3", { value: 20 });

    const result = await storage.query({
      domain: "scores",
      orderBy: "value",
      orderDir: "asc",
    });

    expect(result.items.map((i) => i.data.value)).toEqual([10, 20, 30]);
  });

  it("count returns domain size", async () => {
    await storage.put("agents", "a1", {});
    await storage.put("agents", "a2", {});
    await storage.put("workflows", "w1", {});

    expect(await storage.count("agents")).toBe(2);
    expect(await storage.count("workflows")).toBe(1);
    expect(await storage.count("skills")).toBe(0);
  });

  it("clear removes all records in domain", async () => {
    await storage.put("agents", "a1", {});
    await storage.put("agents", "a2", {});
    await storage.put("workflows", "w1", {});

    const cleared = await storage.clear("agents");
    expect(cleared).toBe(2);
    expect(await storage.count("agents")).toBe(0);
    expect(await storage.count("workflows")).toBe(1);
  });

  it("domains are isolated", async () => {
    await storage.put("agents", "id1", { from: "agents" });
    await storage.put("workflows", "id1", { from: "workflows" });

    const a = await storage.get("agents", "id1");
    const w = await storage.get("workflows", "id1");
    expect(a!.data.from).toBe("agents");
    expect(w!.data.from).toBe("workflows");
  });
});

// =============================================================================
// CompositeStorageAdapter
// =============================================================================

describe("CompositeStorageAdapter", () => {
  it("routes to domain-specific backend", async () => {
    const defaultBackend = new InMemoryStorageAdapter();
    const agentBackend = new InMemoryStorageAdapter();

    const composite = new CompositeStorageAdapter(defaultBackend, {
      agents: agentBackend,
    });

    await composite.put("agents", "a1", { x: 1 });
    await composite.put("workflows", "w1", { y: 2 });

    // agents → agentBackend
    expect(await agentBackend.get("agents", "a1")).not.toBeNull();
    expect(await defaultBackend.get("agents", "a1")).toBeNull();

    // workflows → defaultBackend
    expect(await defaultBackend.get("workflows", "w1")).not.toBeNull();
    expect(await agentBackend.get("workflows", "w1")).toBeNull();
  });

  it("falls back to default for unoverridden domains", async () => {
    const defaultBackend = new InMemoryStorageAdapter();
    const composite = new CompositeStorageAdapter(defaultBackend);

    await composite.put("skills", "s1", { name: "test" });
    expect(await composite.get("skills", "s1")).not.toBeNull();
  });
});

// =============================================================================
// PrometheusMetricsAdapter
// =============================================================================

describe("PrometheusMetricsAdapter", () => {
  let metrics: PrometheusMetricsAdapter;

  beforeEach(() => {
    metrics = new PrometheusMetricsAdapter();
  });

  it("increments counters", () => {
    metrics.incrementCounter("requests_total", 1, { method: "GET" });
    metrics.incrementCounter("requests_total", 1, { method: "GET" });
    metrics.incrementCounter("requests_total", 1, { method: "POST" });

    const output = metrics.serialize();
    expect(output).toContain("# TYPE requests_total counter");
    expect(output).toContain('requests_total{method="GET"} 2');
    expect(output).toContain('requests_total{method="POST"} 1');
  });

  it("records gauges", () => {
    metrics.recordGauge("temperature", 72.5);
    metrics.recordGauge("temperature", 73.0);

    const output = metrics.serialize();
    expect(output).toContain("# TYPE temperature gauge");
    expect(output).toContain("temperature 73");
  });

  it("records histograms with buckets", () => {
    metrics.recordHistogram("latency_seconds", 0.05);
    metrics.recordHistogram("latency_seconds", 0.5);
    metrics.recordHistogram("latency_seconds", 2.0);

    const output = metrics.serialize();
    expect(output).toContain("# TYPE latency_seconds histogram");
    expect(output).toContain("latency_seconds_sum");
    expect(output).toContain("latency_seconds_count");
    expect(output).toContain("latency_seconds_bucket");
  });

  it("reset clears all metrics", () => {
    metrics.incrementCounter("c", 1);
    metrics.recordGauge("g", 1);
    metrics.recordHistogram("h", 1);
    metrics.reset();

    expect(metrics.serialize()).toBe("");
  });
});

// =============================================================================
// FileLearningAdapter
// =============================================================================

describe("FileLearningAdapter", () => {
  let adapter: FileLearningAdapter;
  let fileStore: Record<string, string>;

  beforeEach(() => {
    fileStore = {};
    adapter = new FileLearningAdapter({
      baseDir: "/data",
      resolve: (...parts) => parts.join("/"),
      readFile: async (path) => {
        if (fileStore[path]) return fileStore[path];
        throw new Error("ENOENT");
      },
      writeFile: async (path, content) => {
        fileStore[path] = content;
      },
      exists: async (path) => path in fileStore,
    });
  });

  it("profile CRUD", async () => {
    expect(await adapter.getProfile("u1")).toBeNull();

    const profile = await adapter.updateProfile("u1", {});
    expect(profile.userId).toBe("u1");

    const fetched = await adapter.getProfile("u1");
    expect(fetched).not.toBeNull();

    await adapter.deleteProfile("u1");
    expect(await adapter.getProfile("u1")).toBeNull();
  });

  it("memory add/get/delete", async () => {
    const mem = await adapter.addMemory("u1", { content: "test" } as never);
    expect(mem.id).toBeDefined();

    const memories = await adapter.getMemories("u1");
    expect(memories).toHaveLength(1);

    await adapter.deleteMemory("u1", mem.id);
    expect(await adapter.getMemories("u1")).toHaveLength(0);
  });

  it("clearMemories removes all user memories", async () => {
    await adapter.addMemory("u1", { content: "a" } as never);
    await adapter.addMemory("u1", { content: "b" } as never);
    await adapter.clearMemories("u1");
    expect(await adapter.getMemories("u1")).toHaveLength(0);
  });

  it("knowledge add/query/delete", async () => {
    const k = await adapter.addKnowledge({ content: "TypeScript tips" } as never);
    expect(k.id).toBeDefined();

    const results = await adapter.queryKnowledge("typescript");
    expect(results).toHaveLength(1);

    await adapter.deleteKnowledge(k.id);
    expect(await adapter.queryKnowledge("typescript")).toHaveLength(0);
  });

  it("incrementKnowledgeUsage updates count", async () => {
    const k = await adapter.addKnowledge({ content: "test" } as never);
    await adapter.incrementKnowledgeUsage(k.id);
    await adapter.incrementKnowledgeUsage(k.id);

    const results = await adapter.queryKnowledge("test");
    expect((results[0] as unknown as { usageCount: number }).usageCount).toBe(2);
  });

  it("persists data across load cycles", async () => {
    await adapter.updateProfile("u1", {});

    // Create new adapter instance pointing to same files
    const adapter2 = new FileLearningAdapter({
      baseDir: "/data",
      resolve: (...parts) => parts.join("/"),
      readFile: async (path) => {
        if (fileStore[path]) return fileStore[path];
        throw new Error("ENOENT");
      },
      writeFile: async (path, content) => {
        fileStore[path] = content;
      },
      exists: async (path) => path in fileStore,
    });

    const profile = await adapter2.getProfile("u1");
    expect(profile).not.toBeNull();
  });
});
