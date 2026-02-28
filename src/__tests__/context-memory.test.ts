import { describe, it, expect, beforeEach } from "vitest";
import { ApproximateTokenCounter } from "../adapters/token-counter/approximate.adapter.js";
import { TokenTracker } from "../context/token-tracker.js";
import { ContextManager } from "../context/context-manager.js";
import { VirtualFilesystem } from "../adapters/filesystem/virtual-fs.adapter.js";
import { InMemoryAdapter } from "../adapters/memory/in-memory.adapter.js";
import { resolveContextConfig } from "../agent/agent-config.js";
import type { Message } from "../types.js";

describe("ApproximateTokenCounter", () => {
  const counter = new ApproximateTokenCounter();

  it("counts tokens approximately", () => {
    expect(counter.count("hello world")).toBeGreaterThan(0);
    expect(counter.count("")).toBe(0);
  });

  it("counts message tokens", () => {
    const msgs: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    const count = counter.countMessages(msgs);
    expect(count).toBeGreaterThan(0);
  });

  it("returns context window size for known models", () => {
    expect(counter.getContextWindowSize("gpt-5.2")).toBeGreaterThan(0);
  });

  it("truncates text", () => {
    const long = "a".repeat(1000);
    const truncated = counter.truncate(long, 10);
    expect(truncated.length).toBeLessThan(long.length);
  });
});

describe("TokenTracker", () => {
  it("tracks cumulative usage", () => {
    const counter = new ApproximateTokenCounter();
    const tracker = new TokenTracker(counter, {
      maxInputTokens: 1000,
      maxOutputTokens: 500,
      maxTotalTokens: 1500,
      warningThreshold: 0.8,
    });

    tracker.addInput(100);
    tracker.addOutput(50);
    const usage = tracker.getUsage();
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.totalTokens).toBe(150);
  });

  it("detects over-budget", () => {
    const counter = new ApproximateTokenCounter();
    const tracker = new TokenTracker(counter, {
      maxInputTokens: 100,
      maxOutputTokens: 50,
      maxTotalTokens: 150,
      warningThreshold: 0.8,
    });

    tracker.addInput(200);
    expect(tracker.isOverBudget()).toBe(true);
  });
});

describe("ContextManager", () => {
  it("detects when offloading is needed", () => {
    const counter = new ApproximateTokenCounter();
    const vfs = new VirtualFilesystem();
    const config = resolveContextConfig({ offloadTokenThreshold: 10 });
    const manager = new ContextManager({ tokenCounter: counter, filesystem: vfs, config });

    expect(manager.shouldOffload("short")).toBe(false);
    expect(manager.shouldOffload("a".repeat(1000))).toBe(true);
  });

  it("offloads large results to VFS", async () => {
    const counter = new ApproximateTokenCounter();
    const vfs = new VirtualFilesystem();
    const config = resolveContextConfig();
    const manager = new ContextManager({ tokenCounter: counter, filesystem: vfs, config });

    const ref = await manager.offloadToFilesystem("tc-1", "large content here");
    expect(ref).toContain("tc-1");
    expect(await vfs.exists("tool-results/tc-1.txt", "transient")).toBe(true);
  });
});

describe("InMemoryAdapter", () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
  });

  it("saves and loads todos", async () => {
    const todos = [{ id: "t1", title: "Test", status: "pending" as const, dependencies: [], priority: "medium" as const, createdAt: Date.now(), updatedAt: Date.now() }];
    await adapter.saveTodos("session-1", todos);
    const loaded = await adapter.loadTodos("session-1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe("t1");
  });

  it("saves and loads conversation", async () => {
    const msgs: Message[] = [{ role: "user", content: "hello" }];
    await adapter.saveConversation("s1", msgs);
    const loaded = await adapter.loadConversation("s1");
    expect(loaded).toHaveLength(1);
  });

  it("saves and loads metadata", async () => {
    await adapter.saveMetadata("s1", "key1", { foo: "bar" });
    const loaded = await adapter.loadMetadata("s1", "key1");
    expect(loaded).toEqual({ foo: "bar" });
  });

  it("returns null for missing data", async () => {
    expect(await adapter.loadTodos("none")).toEqual([]);
    expect(await adapter.loadConversation("none")).toEqual([]);
    expect(await adapter.loadMetadata("none", "key")).toBeNull();
    expect(await adapter.loadLatestCheckpoint("none")).toBeNull();
  });

  it("handles checkpoints", async () => {
    const checkpoint = {
      id: "cp1",
      sessionId: "s1",
      stepIndex: 5,
      conversation: [],
      todos: [],
      filesSnapshot: {},
      toolResults: {},
      generatedTokens: 100,
      lastToolCallId: null,
      metadata: {},
      createdAt: Date.now(),
    };
    await adapter.saveCheckpoint("s1", checkpoint);
    const loaded = await adapter.loadLatestCheckpoint("s1");
    expect(loaded).toBeTruthy();
    expect(loaded!.id).toBe("cp1");
  });
});
