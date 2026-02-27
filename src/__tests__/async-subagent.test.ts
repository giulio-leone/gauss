import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { EventBus } from "../agent/event-bus.js";
import {
  SubagentRegistry,
  SubagentDepthExceededError,
  SubagentQueueFullError,
  SubagentQuotaExceededError,
  isTerminalStatus,
} from "../tools/subagent/subagent-registry.js";
import type { SubagentHandle } from "../tools/subagent/subagent-registry.js";
import { createDispatchTool } from "../tools/subagent/dispatch.tool.js";
import { createPollTool } from "../tools/subagent/poll.tool.js";
import { createAwaitTool } from "../tools/subagent/await.tool.js";
import { createAsyncSubagentTools } from "../tools/subagent/index.js";
import type { DelegationHooks } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function makeId(): string {
  return `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`;
}

function createRegistry(
  hooks?: DelegationHooks,
  limitsOverride?: Partial<ConstructorParameters<typeof SubagentRegistry>[1] extends { limits?: infer L } ? L : never>,
) {
  const eventBus = new EventBus("test-session");
  const registry = new SubagentRegistry(eventBus, {
    limits: { gcTtlMs: 100, gcIntervalMs: 999_999, ...limitsOverride },
    hooks,
    generateId: makeId,
  });
  return { eventBus, registry };
}

const toolCtx = {
  toolCallId: "test-call",
  messages: [] as never[],
  abortSignal: new AbortController().signal,
};

// ---------------------------------------------------------------------------
// SubagentRegistry — State Machine
// ---------------------------------------------------------------------------

describe("SubagentRegistry", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("dispatch creates a handle in queued state", () => {
    const { registry } = createRegistry();
    const handle = registry.dispatch("parent-1", 0, { prompt: "hello" });

    expect(handle.taskId).toBe("00000000-0000-4000-8000-000000000001");
    expect(handle.status).toBe("queued");
    expect(handle.parentId).toBe("parent-1");
    expect(handle.depth).toBe(0);
    expect(handle.prompt).toBe("hello");
    expect(handle.finalOutput).toBeNull();
    expect(handle.error).toBeNull();
  });

  it("throws SubagentDepthExceededError if depth >= maxDepth", () => {
    const { registry } = createRegistry(undefined, { maxDepth: 2 });

    expect(() => registry.dispatch("p", 2, { prompt: "x" })).toThrow(
      SubagentDepthExceededError,
    );
  });

  it("throws SubagentQuotaExceededError when parent concurrent limit hit", () => {
    const { registry } = createRegistry(undefined, {
      maxConcurrentPerParent: 2,
    });

    registry.dispatch("p1", 0, { prompt: "a" });
    registry.dispatch("p1", 0, { prompt: "b" });

    expect(() => registry.dispatch("p1", 0, { prompt: "c" })).toThrow(
      SubagentQuotaExceededError,
    );
  });

  it("throws SubagentQueueFullError when queue limit hit", () => {
    const { registry } = createRegistry(undefined, {
      maxQueueSize: 2,
      maxConcurrentPerParent: 100,
    });

    registry.dispatch("p1", 0, { prompt: "a" });
    registry.dispatch("p1", 0, { prompt: "b" });

    expect(() => registry.dispatch("p1", 0, { prompt: "c" })).toThrow(
      SubagentQueueFullError,
    );
  });

  describe("state machine transitions", () => {
    it("queued → running → streaming → completed", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });

      registry.transition(handle.taskId, "running");
      expect(handle.status).toBe("running");

      registry.transition(handle.taskId, "streaming", {
        partialOutput: "chunk1",
      });
      expect(handle.status).toBe("streaming");
      expect(handle.partialOutput).toBe("chunk1");

      registry.transition(handle.taskId, "completed", {
        finalOutput: "done!",
      });
      expect(handle.status).toBe("completed");
      expect(handle.finalOutput).toBe("done!");
    });

    it("queued → cancelled is valid", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });

      registry.transition(handle.taskId, "cancelled", {
        error: "user-cancel",
      });
      expect(handle.status).toBe("cancelled");
    });

    it("running → failed is valid", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });

      registry.transition(handle.taskId, "running");
      registry.transition(handle.taskId, "failed", {
        error: "crash",
      });
      expect(handle.status).toBe("failed");
      expect(handle.error).toBe("crash");
    });

    it("running → timeout is valid", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });

      registry.transition(handle.taskId, "running");
      registry.transition(handle.taskId, "timeout", {
        error: "timed out",
      });
      expect(handle.status).toBe("timeout");
    });

    it("rejects illegal transitions (queued → completed)", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });

      // queued → completed is NOT in the valid transitions map
      registry.transition(handle.taskId, "completed", {
        finalOutput: "no",
      });
      // Should remain queued
      expect(handle.status).toBe("queued");
    });

    it("rejects transitions from terminal states", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });

      registry.transition(handle.taskId, "running");
      registry.transition(handle.taskId, "completed", {
        finalOutput: "ok",
      });

      // Try to transition completed → running
      registry.transition(handle.taskId, "running");
      expect(handle.status).toBe("completed");
    });

    it("rejects illegal transition (queued → streaming)", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });

      registry.transition(handle.taskId, "streaming");
      expect(handle.status).toBe("queued");
    });
  });

  describe("cancellation", () => {
    it("cancel aborts the controller and transitions to cancelled", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });
      registry.transition(handle.taskId, "running");

      const result = registry.cancel(handle.taskId, "test-reason");

      expect(result).toBe(true);
      expect(handle.status).toBe("cancelled");
      expect(handle.abortController.signal.aborted).toBe(true);
      expect(handle.error).toBe("test-reason");
    });

    it("cancel returns false for already-terminal handles", () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });
      registry.transition(handle.taskId, "running");
      registry.transition(handle.taskId, "completed", {
        finalOutput: "done",
      });

      expect(registry.cancel(handle.taskId)).toBe(false);
    });

    it("cancelAll cancels all handles for a parent", () => {
      const { registry } = createRegistry(undefined, {
        maxConcurrentPerParent: 10,
      });

      const h1 = registry.dispatch("p1", 0, { prompt: "a" });
      const h2 = registry.dispatch("p1", 0, { prompt: "b" });
      const h3 = registry.dispatch("p2", 0, { prompt: "c" });

      const count = registry.cancelAll("p1");

      expect(count).toBe(2);
      expect(h1.status).toBe("cancelled");
      expect(h2.status).toBe("cancelled");
      expect(h3.status).toBe("queued"); // Different parent
    });

    it("cascade cancel propagates to children", () => {
      const { registry } = createRegistry(undefined, {
        maxConcurrentPerParent: 10,
        maxDepth: 5,
      });

      const parent = registry.dispatch("root", 0, { prompt: "parent" });
      registry.transition(parent.taskId, "running");

      // Child has parent's taskId as its parentId
      const child = registry.dispatch(parent.taskId, 1, {
        prompt: "child",
      });

      registry.cancel(parent.taskId, "parent-died");

      expect(parent.status).toBe("cancelled");
      expect(child.status).toBe("cancelled");
    });
  });

  describe("GC", () => {
    it("removes terminal handles past gcTtlMs", () => {
      const { registry } = createRegistry(undefined, { gcTtlMs: 50 });
      const handle = registry.dispatch("p", 0, { prompt: "x" });

      registry.transition(handle.taskId, "running");
      registry.transition(handle.taskId, "completed", {
        finalOutput: "done",
      });

      // Before TTL
      registry.gc();
      expect(registry.get(handle.taskId)).toBeDefined();

      // Fake the statusChangedAt to be in the past
      handle.statusChangedAt = Date.now() - 200;
      registry.gc();
      expect(registry.get(handle.taskId)).toBeUndefined();
    });

    it("totalCount reflects handle cleanup", () => {
      const { registry } = createRegistry(undefined, { gcTtlMs: 0 });
      const h1 = registry.dispatch("p", 0, { prompt: "a" });
      const h2 = registry.dispatch("p", 0, { prompt: "b" });

      registry.transition(h1.taskId, "running");
      registry.transition(h1.taskId, "completed", { finalOutput: "ok" });

      h1.statusChangedAt = Date.now() - 10;

      expect(registry.totalCount).toBe(2);
      registry.gc();
      expect(registry.totalCount).toBe(1);
    });
  });

  describe("waitForCompletion", () => {
    it("resolves immediately for terminal handles", async () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });
      registry.transition(handle.taskId, "running");
      registry.transition(handle.taskId, "completed", {
        finalOutput: "done",
      });

      const result = await registry.waitForCompletion(
        handle.taskId,
        5000,
      );
      expect(result.status).toBe("completed");
      expect(result.finalOutput).toBe("done");
    });

    it("resolves when transition completes", async () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });
      registry.transition(handle.taskId, "running");

      const promise = registry.waitForCompletion(handle.taskId, 5000);

      // Transition after a tick
      setTimeout(() => {
        registry.transition(handle.taskId, "completed", {
          finalOutput: "async-done",
        });
      }, 10);

      const result = await promise;
      expect(result.status).toBe("completed");
      expect(result.finalOutput).toBe("async-done");
    });

    it("resolves with current state on timeout", async () => {
      const { registry } = createRegistry();
      const handle = registry.dispatch("p", 0, { prompt: "x" });
      registry.transition(handle.taskId, "running");

      const result = await registry.waitForCompletion(
        handle.taskId,
        50,
      );
      // Still running since nothing completed it
      expect(result.status).toBe("running");
    });

    it("rejects for unknown taskId", async () => {
      const { registry } = createRegistry();

      await expect(
        registry.waitForCompletion("nonexistent", 1000),
      ).rejects.toThrow("not found");
    });
  });

  describe("query methods", () => {
    it("getByParent returns handles for parent", () => {
      const { registry } = createRegistry(undefined, {
        maxConcurrentPerParent: 10,
      });
      registry.dispatch("p1", 0, { prompt: "a" });
      registry.dispatch("p1", 0, { prompt: "b" });
      registry.dispatch("p2", 0, { prompt: "c" });

      expect(registry.getByParent("p1")).toHaveLength(2);
      expect(registry.getByParent("p2")).toHaveLength(1);
      expect(registry.getByParent("p3")).toHaveLength(0);
    });

    it("activeCount and queuedCount are accurate", () => {
      const { registry } = createRegistry(undefined, {
        maxConcurrentPerParent: 10,
      });
      const h1 = registry.dispatch("p", 0, { prompt: "a" });
      const h2 = registry.dispatch("p", 0, { prompt: "b" });

      expect(registry.queuedCount).toBe(2);
      expect(registry.activeCount).toBe(0);

      registry.transition(h1.taskId, "running");
      expect(registry.queuedCount).toBe(1);
      expect(registry.activeCount).toBe(1);

      registry.transition(h1.taskId, "streaming");
      expect(registry.activeCount).toBe(1);
    });
  });

  describe("events", () => {
    it("emits subagent:spawn on dispatch", () => {
      const { eventBus, registry } = createRegistry();
      const handler = vi.fn();
      eventBus.on("subagent:spawn", handler);

      registry.dispatch("p", 0, { prompt: "hi" });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].data).toMatchObject({
        parentId: "p",
        prompt: "hi",
      });
    });

    it("emits subagent:status-change on transition", () => {
      const { eventBus, registry } = createRegistry();
      const handler = vi.fn();
      eventBus.on("*", handler);

      const handle = registry.dispatch("p", 0, { prompt: "x" });
      const spawnCallCount = handler.mock.calls.length;

      registry.transition(handle.taskId, "running");

      // Should have emitted at least status-change
      expect(handler.mock.calls.length).toBeGreaterThan(spawnCallCount);
    });

    it("emits subagent:complete on terminal transition", () => {
      const { eventBus, registry } = createRegistry();
      const handler = vi.fn();
      eventBus.on("subagent:complete", handler);

      const handle = registry.dispatch("p", 0, { prompt: "x" });
      registry.transition(handle.taskId, "running");
      registry.transition(handle.taskId, "completed", {
        finalOutput: "done",
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("emits delegation:start on dispatch", () => {
      const { eventBus, registry } = createRegistry();
      const handler = vi.fn();
      eventBus.on("delegation:start", handler);

      registry.dispatch("p", 0, { prompt: "delegated-task" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].data).toMatchObject({
        parentId: "p",
        prompt: "delegated-task",
      });
    });

    it("emits delegation:complete on terminal transition", () => {
      const { eventBus, registry } = createRegistry();
      const handler = vi.fn();
      eventBus.on("delegation:complete", handler);

      const handle = registry.dispatch("p", 0, { prompt: "x" });
      registry.transition(handle.taskId, "running");
      registry.transition(handle.taskId, "completed", {
        finalOutput: "done",
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].data).toMatchObject({
        taskId: handle.taskId,
        parentId: "p",
        status: "completed",
      });
    });
  });

  it("shutdown cancels non-terminal handles", async () => {
    const { registry } = createRegistry(undefined, {
      maxConcurrentPerParent: 10,
    });
    const h1 = registry.dispatch("p", 0, { prompt: "a" });
    registry.transition(h1.taskId, "running");
    const h2 = registry.dispatch("p", 0, { prompt: "b" });

    await registry.shutdown();

    expect(h1.status).toBe("cancelled");
    expect(h2.status).toBe("cancelled");
  });

  it("invokes onDelegationComplete hook on terminal transition", async () => {
    const onDelegationComplete = vi
      .fn<NonNullable<DelegationHooks["onDelegationComplete"]>>()
      .mockResolvedValue(undefined);

    const { registry } = createRegistry({ onDelegationComplete });
    const handle = registry.dispatch("p", 0, { prompt: "x" });
    registry.transition(handle.taskId, "running");
    registry.transition(handle.taskId, "completed", {
      finalOutput: "done",
    });

    // Hook execution is async fire-and-forget.
    await Promise.resolve();

    expect(onDelegationComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: handle.taskId,
        parentId: "p",
        status: "completed",
      }),
    );
  });

  it("isTerminalStatus helper", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("timeout")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isTerminalStatus("streaming")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dispatch Tool
// ---------------------------------------------------------------------------

describe("dispatch_subagent tool", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("dispatches and returns taskId + queued status", async () => {
    const { registry } = createRegistry();
    const dispatchTool = createDispatchTool({
      registry,
      parentId: "parent-1",
      currentDepth: 0,
    });

    const result = await dispatchTool.execute!(
      { prompt: "analyze data", priority: 5 },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.taskId).toBeDefined();
    expect(parsed.status).toBe("queued");
    expect(parsed.message).toContain("dispatched");
  });

  it("returns error for depth exceeded", async () => {
    const { registry } = createRegistry(undefined, { maxDepth: 1 });
    const dispatchTool = createDispatchTool({
      registry,
      parentId: "p",
      currentDepth: 1,
    });

    const result = await dispatchTool.execute!(
      { prompt: "too deep", priority: 5 },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("depth");
  });

  it("passes metadata and instructions", async () => {
    const { registry } = createRegistry();
    const dispatchTool = createDispatchTool({
      registry,
      parentId: "p",
      currentDepth: 0,
    });

    await dispatchTool.execute!(
      {
        prompt: "task",
        instructions: "be careful",
        priority: 3,
        timeoutMs: 60_000,
        metadata: { key: "value" },
      },
      toolCtx,
    );

    const handle = registry.getByParent("p")[0];
    expect(handle!.instructions).toBe("be careful");
    expect(handle!.priority).toBe(3);
    expect(handle!.timeoutMs).toBe(60_000);
    expect(handle!.metadata).toEqual({ key: "value" });
  });

  it("honors onDelegationStart hook deny decision", async () => {
    const hooks: DelegationHooks = {
      onDelegationStart: async () => ({
        allow: false,
        reason: "blocked-by-policy",
      }),
    };

    const { registry } = createRegistry();
    const dispatchTool = createDispatchTool({
      registry,
      parentId: "p",
      currentDepth: 0,
      hooks,
    });

    const result = await dispatchTool.execute!(
      { prompt: "task", priority: 5 },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.blocked).toBe(true);
    expect(parsed.error).toContain("blocked-by-policy");
    expect(registry.totalCount).toBe(0);
  });

  it("applies onDelegationStart hook parameter overrides", async () => {
    const hooks: DelegationHooks = {
      onDelegationStart: async () => ({
        prompt: "rewritten task",
        priority: 1,
        metadata: { source: "supervisor" },
      }),
    };

    const { registry } = createRegistry();
    const dispatchTool = createDispatchTool({
      registry,
      parentId: "p",
      currentDepth: 0,
      hooks,
    });

    await dispatchTool.execute!(
      { prompt: "original", priority: 5 },
      toolCtx,
    );

    const handle = registry.getByParent("p")[0];
    expect(handle?.prompt).toBe("rewritten task");
    expect(handle?.priority).toBe(1);
    expect(handle?.metadata).toEqual({ source: "supervisor" });
  });
});

// ---------------------------------------------------------------------------
// Poll Tool
// ---------------------------------------------------------------------------

describe("poll_subagent tool", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("returns status for multiple tasks", async () => {
    const { registry } = createRegistry(undefined, {
      maxConcurrentPerParent: 10,
    });
    const pollTool = createPollTool({ registry });

    const h1 = registry.dispatch("p", 0, { prompt: "a" });
    const h2 = registry.dispatch("p", 0, { prompt: "b" });
    registry.transition(h1.taskId, "running");
    registry.transition(h1.taskId, "completed", { finalOutput: "result-a" });

    const result = await pollTool.execute!(
      {
        taskIds: [h1.taskId, h2.taskId],
        includePartialOutput: true,
        maxPartialOutputLength: 2000,
      },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0].status).toBe("completed");
    expect(parsed.tasks[0].finalOutput).toBe("result-a");
    expect(parsed.tasks[1].status).toBe("queued");
    expect(parsed.summary.completed).toBe(1);
    expect(parsed.summary.queued).toBe(1);
  });

  it("returns not_found for unknown taskId", async () => {
    const { registry } = createRegistry();
    const pollTool = createPollTool({ registry });

    const result = await pollTool.execute!(
      {
        taskIds: ["00000000-0000-4000-8000-000000000999"],
        includePartialOutput: true,
        maxPartialOutputLength: 2000,
      },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.tasks[0].status).toBe("not_found");
  });

  it("includes partial output for streaming tasks", async () => {
    const { registry } = createRegistry();
    const pollTool = createPollTool({ registry });

    const h = registry.dispatch("p", 0, { prompt: "x" });
    registry.transition(h.taskId, "running");
    registry.transition(h.taskId, "streaming", {
      partialOutput: "chunk-data",
    });

    const result = await pollTool.execute!(
      {
        taskIds: [h.taskId],
        includePartialOutput: true,
        maxPartialOutputLength: 2000,
      },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.tasks[0].partialOutput).toBe("chunk-data");
  });

  it("includes error for failed tasks", async () => {
    const { registry } = createRegistry();
    const pollTool = createPollTool({ registry });

    const h = registry.dispatch("p", 0, { prompt: "x" });
    registry.transition(h.taskId, "running");
    registry.transition(h.taskId, "failed", { error: "boom" });

    const result = await pollTool.execute!(
      {
        taskIds: [h.taskId],
        includePartialOutput: true,
        maxPartialOutputLength: 2000,
      },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.tasks[0].error).toBe("boom");
    expect(parsed.summary.failed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Await Tool
// ---------------------------------------------------------------------------

describe("await_subagent tool", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("returns immediately for already-completed tasks", async () => {
    const { registry } = createRegistry();
    const awaitTool = createAwaitTool({ registry });

    const h = registry.dispatch("p", 0, { prompt: "x" });
    registry.transition(h.taskId, "running");
    registry.transition(h.taskId, "completed", { finalOutput: "done!" });

    const result = await awaitTool.execute!(
      { taskIds: [h.taskId], timeoutMs: 5000 },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].status).toBe("completed");
    expect(parsed[0].output).toBe("done!");
  });

  it("waits for async completion", async () => {
    const { registry } = createRegistry();
    const awaitTool = createAwaitTool({ registry });

    const h = registry.dispatch("p", 0, { prompt: "x" });
    registry.transition(h.taskId, "running");

    // Complete after 20ms
    setTimeout(() => {
      registry.transition(h.taskId, "completed", {
        finalOutput: "async-result",
      });
    }, 20);

    const result = await awaitTool.execute!(
      { taskIds: [h.taskId], timeoutMs: 5000 },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed[0].status).toBe("completed");
    expect(parsed[0].output).toBe("async-result");
  });

  it("handles multiple taskIds with Promise.allSettled", async () => {
    const { registry } = createRegistry(undefined, {
      maxConcurrentPerParent: 10,
    });
    const awaitTool = createAwaitTool({ registry });

    const h1 = registry.dispatch("p", 0, { prompt: "a" });
    const h2 = registry.dispatch("p", 0, { prompt: "b" });

    registry.transition(h1.taskId, "running");
    registry.transition(h1.taskId, "completed", { finalOutput: "r1" });

    registry.transition(h2.taskId, "running");
    registry.transition(h2.taskId, "failed", { error: "crash" });

    const result = await awaitTool.execute!(
      { taskIds: [h1.taskId, h2.taskId], timeoutMs: 5000 },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].status).toBe("completed");
    expect(parsed[1].status).toBe("failed");
    expect(parsed[1].error).toBe("crash");
  });

  it("returns not_found for garbage-collected taskId", async () => {
    const { registry } = createRegistry();
    const awaitTool = createAwaitTool({ registry });

    const result = await awaitTool.execute!(
      {
        taskIds: ["00000000-0000-4000-8000-000000000999"],
        timeoutMs: 1000,
      },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed[0].status).toBe("not_found");
  });

  it("respects timeout and returns partial results", async () => {
    const { registry } = createRegistry();
    const awaitTool = createAwaitTool({ registry });

    const h = registry.dispatch("p", 0, { prompt: "x" });
    registry.transition(h.taskId, "running");
    // Never completes

    const result = await awaitTool.execute!(
      { taskIds: [h.taskId], timeoutMs: 50 },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed[0].status).toBe("running");
  });

  it("supports isTaskComplete hook for early completion", async () => {
    const completionHook = vi
      .fn<NonNullable<DelegationHooks["isTaskComplete"]>>()
      .mockResolvedValue({ isComplete: true, reason: "enough-signal" });

    const { registry } = createRegistry();
    const awaitTool = createAwaitTool({
      registry,
      hooks: { isTaskComplete: completionHook },
    });

    const h = registry.dispatch("p", 0, { prompt: "x" });
    registry.transition(h.taskId, "running");

    const result = await awaitTool.execute!(
      { taskIds: [h.taskId], timeoutMs: 2_000, pollIntervalMs: 50 },
      toolCtx,
    );

    const parsed = JSON.parse(result);
    expect(parsed[0].status).toBe("running");
    expect(parsed[0].completionOverride).toBe(true);
    expect(parsed[0].completionReason).toBe("enough-signal");
    expect(completionHook).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createAsyncSubagentTools (factory)
// ---------------------------------------------------------------------------

describe("createAsyncSubagentTools", () => {
  it("returns all 3 tools", () => {
    const { registry } = createRegistry();
    const tools = createAsyncSubagentTools({
      registry,
      parentId: "root",
      maxDepth: 3,
      currentDepth: 0,
    });

    expect(tools).toHaveProperty("dispatch_subagent");
    expect(tools).toHaveProperty("poll_subagent");
    expect(tools).toHaveProperty("await_subagent");
    expect(tools.dispatch_subagent).toHaveProperty("execute");
    expect(tools.poll_subagent).toHaveProperty("execute");
    expect(tools.await_subagent).toHaveProperty("execute");
  });
});

// ---------------------------------------------------------------------------
// Integration: dispatch + poll + await flow
// ---------------------------------------------------------------------------

describe("dispatch → poll → await integration", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("full lifecycle: dispatch, poll (queued), transition, poll (completed), await", async () => {
    const { registry } = createRegistry();
    const tools = createAsyncSubagentTools({
      registry,
      parentId: "coordinator",
      maxDepth: 3,
      currentDepth: 0,
    });

    // Step 1: dispatch
    const dispatchResult = await tools.dispatch_subagent.execute!(
      { prompt: "analyze data", priority: 3 },
      toolCtx,
    );
    const { taskId } = JSON.parse(dispatchResult);

    // Step 2: poll — should be queued
    const poll1 = await tools.poll_subagent.execute!(
      { taskIds: [taskId], includePartialOutput: true, maxPartialOutputLength: 2000 },
      toolCtx,
    );
    expect(JSON.parse(poll1).tasks[0].status).toBe("queued");

    // Simulate scheduler picking up
    registry.transition(taskId, "running");

    // Step 3: poll — should be running
    const poll2 = await tools.poll_subagent.execute!(
      { taskIds: [taskId], includePartialOutput: true, maxPartialOutputLength: 2000 },
      toolCtx,
    );
    expect(JSON.parse(poll2).tasks[0].status).toBe("running");

    // Simulate completion
    registry.transition(taskId, "completed", {
      finalOutput: "analysis complete",
    });

    // Step 4: await — should resolve immediately
    const awaitResult = await tools.await_subagent.execute!(
      { taskIds: [taskId], timeoutMs: 5000 },
      toolCtx,
    );
    const awaited = JSON.parse(awaitResult);
    expect(awaited[0].status).toBe("completed");
    expect(awaited[0].output).toBe("analysis complete");
  });

  it("multiple dispatch in parallel", async () => {
    const { registry } = createRegistry(undefined, {
      maxConcurrentPerParent: 10,
    });
    const tools = createAsyncSubagentTools({
      registry,
      parentId: "coordinator",
      maxDepth: 3,
      currentDepth: 0,
    });

    // Dispatch 3 tasks
    const [r1, r2, r3] = await Promise.all([
      tools.dispatch_subagent.execute!(
        { prompt: "task-1", priority: 1 },
        toolCtx,
      ),
      tools.dispatch_subagent.execute!(
        { prompt: "task-2", priority: 5 },
        toolCtx,
      ),
      tools.dispatch_subagent.execute!(
        { prompt: "task-3", priority: 10 },
        toolCtx,
      ),
    ]);

    const ids = [r1, r2, r3].map((r) => JSON.parse(r).taskId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // All unique

    // Poll all
    const pollResult = await tools.poll_subagent.execute!(
      { taskIds: ids, includePartialOutput: false, maxPartialOutputLength: 0 },
      toolCtx,
    );
    const parsed = JSON.parse(pollResult);
    expect(parsed.summary.total).toBe(3);
    expect(parsed.summary.queued).toBe(3);
  });

  it("timeout handling in await", async () => {
    const { registry } = createRegistry();
    const tools = createAsyncSubagentTools({
      registry,
      parentId: "p",
      maxDepth: 3,
      currentDepth: 0,
    });

    const dispatchResult = await tools.dispatch_subagent.execute!(
      { prompt: "slow task", priority: 5 },
      toolCtx,
    );
    const { taskId } = JSON.parse(dispatchResult);

    registry.transition(taskId, "running");

    // Await with very short timeout
    const awaitResult = await tools.await_subagent.execute!(
      { taskIds: [taskId], timeoutMs: 1_000 },
      toolCtx,
    );

    const parsed = JSON.parse(awaitResult);
    // Should return with current (non-terminal) status since it didn't complete
    expect(parsed[0].status).toBe("running");
  });
});

// ---------------------------------------------------------------------------
// Priority ordering (unit test for PriorityQueue)
// ---------------------------------------------------------------------------

describe("PriorityQueue", () => {
  // We can import it now since it's exported
  it("dequeues higher priority first", async () => {
    const { PriorityQueue } = await import(
      "../tools/subagent/subagent-scheduler.js"
    );
    const q = new PriorityQueue(5_000);

    const makeHandle = (taskId: string, priority: number) =>
      ({
        taskId,
        priority,
        status: "queued",
        abortController: new AbortController(),
      }) as SubagentHandle;

    q.enqueue(makeHandle("low", 10));
    q.enqueue(makeHandle("high", 1));
    q.enqueue(makeHandle("mid", 5));

    expect(q.dequeue()!.taskId).toBe("high");
    expect(q.dequeue()!.taskId).toBe("mid");
    expect(q.dequeue()!.taskId).toBe("low");
  });

  it("remove removes a specific entry", async () => {
    const { PriorityQueue } = await import(
      "../tools/subagent/subagent-scheduler.js"
    );
    const q = new PriorityQueue(5_000);

    const makeHandle = (taskId: string, priority: number) =>
      ({
        taskId,
        priority,
        status: "queued",
        abortController: new AbortController(),
      }) as SubagentHandle;

    q.enqueue(makeHandle("a", 1));
    q.enqueue(makeHandle("b", 2));
    q.enqueue(makeHandle("c", 3));

    expect(q.remove("b")).toBe(true);
    expect(q.size).toBe(2);
    expect(q.dequeue()!.taskId).toBe("a");
    expect(q.dequeue()!.taskId).toBe("c");
  });
});
