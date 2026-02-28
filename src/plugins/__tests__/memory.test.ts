// =============================================================================
// Memory system tests — InMemoryAgentMemoryAdapter, FileMemoryAdapter, MemoryPlugin
// =============================================================================

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { InMemoryAgentMemoryAdapter } from "../../adapters/memory/in-memory-agent-memory.adapter.js";
import { FileMemoryAdapter } from "../../adapters/memory/file-memory.adapter.js";
import { MemoryPlugin } from "../memory.plugin.js";
import type { MemoryEntry } from "../../ports/agent-memory.port.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    content: "Test content",
    type: "fact",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemoryAgentMemoryAdapter
// ─────────────────────────────────────────────────────────────────────────────

describe("InMemoryAgentMemoryAdapter", () => {
  let adapter: InMemoryAgentMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAgentMemoryAdapter();
  });

  it("should store and recall an entry", async () => {
    const entry = makeEntry({ content: "Hello world" });
    await adapter.store(entry);

    const results = await adapter.recall("", {});
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("Hello world");
  });

  it("should recall with type filter", async () => {
    await adapter.store(makeEntry({ type: "fact", content: "fact1" }));
    await adapter.store(makeEntry({ type: "preference", content: "pref1" }));

    const facts = await adapter.recall("", { type: "fact" });
    expect(facts).toHaveLength(1);
    expect(facts[0].content).toBe("fact1");
  });

  it("should recall with tier filter", async () => {
    await adapter.store(
      makeEntry({
        type: "fact",
        tier: "semantic",
        content: "semantic-fact",
      }),
    );
    await adapter.store(
      makeEntry({
        type: "summary",
        tier: "observation",
        content: "observation-summary",
      }),
    );

    const semantic = await adapter.recall("", { tier: "semantic" });
    expect(semantic).toHaveLength(1);
    expect(semantic[0].content).toBe("semantic-fact");
  });

  it("should recall with sessionId filter", async () => {
    await adapter.store(makeEntry({ sessionId: "s1", content: "session1" }));
    await adapter.store(makeEntry({ sessionId: "s2", content: "session2" }));

    const results = await adapter.recall("", { sessionId: "s1" });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("session1");
  });

  it("should recall with minImportance filter", async () => {
    await adapter.store(makeEntry({ importance: 0.3, content: "low" }));
    await adapter.store(makeEntry({ importance: 0.8, content: "high" }));

    const results = await adapter.recall("", { minImportance: 0.5 });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("high");
  });

  it("should recall with keyword query", async () => {
    await adapter.store(makeEntry({ content: "TypeScript is great" }));
    await adapter.store(makeEntry({ content: "Python is nice" }));

    const results = await adapter.recall("", { query: "typescript" });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("TypeScript is great");
  });

  it("should respect limit", async () => {
    for (let i = 0; i < 20; i++) {
      await adapter.store(makeEntry({ content: `entry ${i}` }));
    }

    const results = await adapter.recall("", { limit: 5 });
    expect(results).toHaveLength(5);
  });

  it("should sort by timestamp descending", async () => {
    await adapter.store(makeEntry({ content: "old", timestamp: "2024-01-01T00:00:00Z" }));
    await adapter.store(makeEntry({ content: "new", timestamp: "2024-12-01T00:00:00Z" }));

    const results = await adapter.recall("", {});
    expect(results[0].content).toBe("new");
    expect(results[1].content).toBe("old");
  });

  it("should return empty array for no matches", async () => {
    const results = await adapter.recall("", { type: "task" });
    expect(results).toEqual([]);
  });

  it("should summarize entries (truncate at 500 chars)", async () => {
    const entries = [makeEntry({ content: "A".repeat(300) }), makeEntry({ content: "B".repeat(300) })];
    const summary = await adapter.summarize(entries);
    expect(summary).toHaveLength(503); // 500 + "..."
    expect(summary.endsWith("...")).toBe(true);
  });

  it("should summarize short entries without truncation", async () => {
    const entries = [makeEntry({ content: "Hello" }), makeEntry({ content: "World" })];
    const summary = await adapter.summarize(entries);
    expect(summary).toBe("Hello\nWorld");
  });

  it("should clear all entries", async () => {
    await adapter.store(makeEntry());
    await adapter.store(makeEntry());
    await adapter.clear();

    const results = await adapter.recall("", {});
    expect(results).toHaveLength(0);
  });

  it("should return correct stats", async () => {
    await adapter.store(
      makeEntry({
        type: "fact",
        tier: "semantic",
        timestamp: "2024-01-01T00:00:00Z",
      }),
    );
    await adapter.store(
      makeEntry({
        type: "fact",
        tier: "semantic",
        timestamp: "2024-06-01T00:00:00Z",
      }),
    );
    await adapter.store(
      makeEntry({
        type: "task",
        tier: "working",
        timestamp: "2024-12-01T00:00:00Z",
      }),
    );

    const stats = await adapter.getStats();
    expect(stats.totalEntries).toBe(3);
    expect(stats.byType).toEqual({ fact: 2, task: 1 });
    expect(stats.byTier).toMatchObject({ semantic: 2, working: 1 });
    expect(stats.oldestEntry).toBe("2024-01-01T00:00:00Z");
    expect(stats.newestEntry).toBe("2024-12-01T00:00:00Z");
  });

  it("should evict oldest entries when maxEntries is exceeded (LRU)", async () => {
    const small = new InMemoryAgentMemoryAdapter({ maxEntries: 3 });

    await small.store(makeEntry({ id: "a", content: "first" }));
    await small.store(makeEntry({ id: "b", content: "second" }));
    await small.store(makeEntry({ id: "c", content: "third" }));
    await small.store(makeEntry({ id: "d", content: "fourth" }));

    const stats = await small.getStats();
    expect(stats.totalEntries).toBe(3);

    const results = await small.recall("", { limit: 100 });
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("a"); // evicted
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(ids).toContain("d");
  });

  it("should handle updating an existing entry", async () => {
    const entry = makeEntry({ id: "x", content: "original" });
    await adapter.store(entry);
    await adapter.store({ ...entry, content: "updated" });

    const results = await adapter.recall("", {});
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("updated");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FileMemoryAdapter
// ─────────────────────────────────────────────────────────────────────────────

describe("FileMemoryAdapter", () => {
  let tmpDir: string;
  let adapter: FileMemoryAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gauss-memory-test-"));
    adapter = new FileMemoryAdapter({ directory: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should store and recall entries (persistence)", async () => {
    const entry = makeEntry({ content: "Persistent fact", sessionId: "sess1" });
    await adapter.store(entry);

    // Create a new adapter pointing to the same directory to verify persistence
    const adapter2 = new FileMemoryAdapter({ directory: tmpDir });
    const results = await adapter2.recall("", {});
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("Persistent fact");
  });

  it("should store global entries (no sessionId)", async () => {
    const entry = makeEntry({ content: "Global memory" });
    await adapter.store(entry);

    const results = await adapter.recall("", {});
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("Global memory");
  });

  it("should filter by type", async () => {
    await adapter.store(makeEntry({ type: "fact", content: "a fact" }));
    await adapter.store(makeEntry({ type: "preference", content: "a pref" }));

    const facts = await adapter.recall("", { type: "fact" });
    expect(facts).toHaveLength(1);
    expect(facts[0].content).toBe("a fact");
  });

  it("should filter by tier", async () => {
    await adapter.store(
      makeEntry({ type: "fact", tier: "semantic", content: "semantic fact" }),
    );
    await adapter.store(
      makeEntry({
        type: "summary",
        tier: "observation",
        content: "observation summary",
      }),
    );

    const semantic = await adapter.recall("", { tier: "semantic" });
    expect(semantic).toHaveLength(1);
    expect(semantic[0].content).toBe("semantic fact");
  });

  it("should clear all files", async () => {
    await adapter.store(makeEntry({ sessionId: "s1" }));
    await adapter.store(makeEntry({ sessionId: "s2" }));
    await adapter.clear();

    const results = await adapter.recall("", {});
    expect(results).toHaveLength(0);
  });

  it("should return correct stats", async () => {
    await adapter.store(
      makeEntry({
        type: "fact",
        tier: "semantic",
        timestamp: "2024-01-01T00:00:00Z",
      }),
    );
    await adapter.store(
      makeEntry({
        type: "task",
        tier: "working",
        timestamp: "2024-12-01T00:00:00Z",
      }),
    );

    const stats = await adapter.getStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.byType).toEqual({ fact: 1, task: 1 });
    expect(stats.byTier).toMatchObject({ semantic: 1, working: 1 });
    expect(stats.oldestEntry).toBe("2024-01-01T00:00:00Z");
    expect(stats.newestEntry).toBe("2024-12-01T00:00:00Z");
  });

  it("should handle updating an existing entry in the same file", async () => {
    const entry = makeEntry({ id: "x", content: "original", sessionId: "s1" });
    await adapter.store(entry);
    await adapter.store({ ...entry, content: "updated" });

    const results = await adapter.recall("", { sessionId: "s1" });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("updated");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MemoryPlugin
// ─────────────────────────────────────────────────────────────────────────────

describe("MemoryPlugin", () => {
  let plugin: MemoryPlugin;

  beforeEach(() => {
    plugin = new MemoryPlugin();
  });

  it("should expose name and version", () => {
    expect(plugin.name).toBe("memory");
    expect(plugin.version).toBe("1.0.0");
  });

  it("should have all memory tools", () => {
    expect(plugin.tools).toHaveProperty("memory:store");
    expect(plugin.tools).toHaveProperty("memory:recall");
    expect(plugin.tools).toHaveProperty("memory:observe");
    expect(plugin.tools).toHaveProperty("memory:reflect");
    expect(plugin.tools).toHaveProperty("memory:stats");
    expect(plugin.tools).toHaveProperty("memory:clear");
  });

  it("memory:store should store an entry", async () => {
    const storeTool = plugin.tools["memory:store"] as any;
    const result = await storeTool.execute({ content: "Remember this", type: "fact", importance: 0.8 });
    expect(result).toContain("Stored memory entry");
    expect(result).toContain("type: fact");
  });

  it("memory:store should support explicit tier", async () => {
    const storeTool = plugin.tools["memory:store"] as any;
    const recallTool = plugin.tools["memory:recall"] as any;

    await storeTool.execute({
      content: "Semantic memory",
      type: "fact",
      tier: "semantic",
      importance: 0.9,
    });

    const recalled = await recallTool.execute({ tier: "semantic" });
    expect(recalled).toContain("Semantic memory");
    expect(recalled).toContain("[semantic:fact]");
  });

  it("memory:recall should return stored entries", async () => {
    const storeTool = plugin.tools["memory:store"] as any;
    const recallTool = plugin.tools["memory:recall"] as any;

    await storeTool.execute({ content: "TypeScript rocks", type: "fact" });
    const result = await recallTool.execute({ query: "typescript" });
    expect(result).toContain("TypeScript rocks");
  });

  it("memory:observe should store observation tier entries", async () => {
    const observeTool = plugin.tools["memory:observe"] as any;
    const recallTool = plugin.tools["memory:recall"] as any;

    const result = await observeTool.execute({
      content: "Model hesitates when requirements are ambiguous",
      importance: 0.8,
    });
    expect(result).toContain("Stored observation");

    const observations = await recallTool.execute({ tier: "observation" });
    expect(observations).toContain("Model hesitates");
    expect(observations).toContain("[observation:summary]");
  });

  it("memory:reflect should summarize observations into target tier", async () => {
    const observeTool = plugin.tools["memory:observe"] as any;
    const reflectTool = plugin.tools["memory:reflect"] as any;
    const recallTool = plugin.tools["memory:recall"] as any;

    await observeTool.execute({ content: "Observation A" });
    await observeTool.execute({ content: "Observation B" });

    const reflection = await reflectTool.execute({
      targetTier: "semantic",
      limit: 10,
    });

    expect(reflection).toContain("Reflection stored in tier 'semantic'");

    const semantic = await recallTool.execute({ tier: "semantic" });
    expect(semantic).toContain("[semantic:summary]");
  });

  it("memory:recall should return 'No memories found' when empty", async () => {
    const recallTool = plugin.tools["memory:recall"] as any;
    const result = await recallTool.execute({});
    expect(result).toBe("No memories found.");
  });

  it("memory:stats should return JSON stats", async () => {
    const storeTool = plugin.tools["memory:store"] as any;
    const statsTool = plugin.tools["memory:stats"] as any;

    await storeTool.execute({ content: "A fact", type: "fact" });
    const result = await statsTool.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.totalEntries).toBe(1);
    expect(parsed.byType.fact).toBe(1);
  });

  it("memory:clear should clear all entries", async () => {
    const storeTool = plugin.tools["memory:store"] as any;
    const clearTool = plugin.tools["memory:clear"] as any;
    const statsTool = plugin.tools["memory:stats"] as any;

    await storeTool.execute({ content: "temp", type: "fact" });
    const clearResult = await clearTool.execute({});
    expect(clearResult).toBe("All memories cleared.");

    const stats = JSON.parse(await statsTool.execute({}));
    expect(stats.totalEntries).toBe(0);
  });

  it("should accept a custom adapter", async () => {
    const customAdapter = new InMemoryAgentMemoryAdapter({ maxEntries: 5 });
    const customPlugin = new MemoryPlugin({ adapter: customAdapter });

    const storeTool = customPlugin.tools["memory:store"] as any;
    await storeTool.execute({ content: "Custom", type: "preference" });

    const stats = await customAdapter.getStats();
    expect(stats.totalEntries).toBe(1);
  });

  it("autoStore should store summary after run", async () => {
    const adapter = new InMemoryAgentMemoryAdapter();
    const autoPlugin = new MemoryPlugin({ adapter, autoStore: true });

    expect(autoPlugin.hooks?.afterRun).toBeDefined();

    // Simulate afterRun hook
    const mockCtx = {
      sessionId: "test-session",
      config: { instructions: "", maxSteps: 10 },
      filesystem: {} as any,
      memory: {} as any,
      toolNames: [],
    };
    const mockParams = {
      result: {
        text: "The agent completed the task successfully.",
        steps: [],
        sessionId: "test-session",
      },
    };

    await autoPlugin.hooks!.afterRun!(mockCtx, mockParams);

    const results = await adapter.recall("", {});
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("summary");
    expect(results[0].tier).toBe("short");
    expect(results[0].sessionId).toBe("test-session");
  });

  it("autoStore should not store empty results", async () => {
    const adapter = new InMemoryAgentMemoryAdapter();
    const autoPlugin = new MemoryPlugin({ adapter, autoStore: true });

    const mockCtx = {
      sessionId: "test-session",
      config: { instructions: "", maxSteps: 10 },
      filesystem: {} as any,
      memory: {} as any,
      toolNames: [],
    };

    await autoPlugin.hooks!.afterRun!(mockCtx, {
      result: { text: "", steps: [], sessionId: "test-session" },
    });

    const results = await adapter.recall("", {});
    expect(results).toHaveLength(0);
  });
});
