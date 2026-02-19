import { describe, it, expect, vi } from "vitest";

import { GraphExecutor } from "../graph-executor.js";
import { SharedContext } from "../shared-context.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import type { AgentNode } from "../agent-node.js";
import type { NodeResult } from "../agent-node.js";
import type { GraphConfig, GraphStreamEvent } from "../../domain/graph.schema.js";

// =============================================================================
// Helpers
// =============================================================================

function mockNode(id: string, output = `output-${id}`, delay = 0): AgentNode {
  return {
    id,
    type: "agent",
    run: vi.fn(async (): Promise<NodeResult> => {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      return { nodeId: id, output, durationMs: delay };
    }),
  } as unknown as AgentNode;
}

function tokenNode(
  id: string,
  tokenUsage: { input: number; output: number },
  delay = 0,
): AgentNode {
  return {
    id,
    type: "agent",
    run: vi.fn(async (): Promise<NodeResult> => {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      return { nodeId: id, output: `output-${id}`, tokenUsage, durationMs: delay };
    }),
  } as unknown as AgentNode;
}

function defaultConfig(overrides?: Partial<GraphConfig>): GraphConfig {
  return {
    maxDepth: 10,
    maxConcurrency: 5,
    timeoutMs: 600_000,
    maxTokenBudget: 1_000_000,
    ...overrides,
  };
}

async function collectEvents(
  gen: AsyncGenerator<GraphStreamEvent>,
): Promise<GraphStreamEvent[]> {
  const events: GraphStreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// =============================================================================
// Tests — Reactive GraphExecutor
// =============================================================================

describe("ReactiveGraphExecutor", () => {
  // ── Work-stealing: fast nodes don't wait for slow ones ──

  it("work-stealing: fast nodes proceed without waiting for slow batch-mates", async () => {
    // DAG:  a(slow,100ms) and b(fast,5ms) are independent roots
    //       c depends on b only, d depends on a only
    // With old batch executor: c waits for a (100ms batch) even though b is done
    // With reactive: c starts as soon as b finishes
    const a = mockNode("a", "out-a", 100);
    const b = mockNode("b", "out-b", 5);
    const c = mockNode("c", "out-c");
    const d = mockNode("d", "out-d");

    const nodes = new Map([["a", a], ["b", b], ["c", c], ["d", d]]);
    const edges = new Map([["c", ["b"]], ["d", ["a"]]]);
    const forks = new Map();

    const executor = new GraphExecutor(
      nodes, edges, forks, defaultConfig(),
      new SharedContext(new VirtualFilesystem()),
    );

    const events = await collectEvents(executor.stream("prompt"));
    const nodeStarts = events
      .filter((e) => e.type === "node:start")
      .map((e) => (e as { nodeId: string }).nodeId);
    const nodeCompletes = events
      .filter((e) => e.type === "node:complete")
      .map((e) => (e as { nodeId: string }).nodeId);

    // c should start (and complete) before a completes
    const cStartIdx = nodeStarts.indexOf("c");
    const aCompleteIdx = nodeCompletes.indexOf("a");
    expect(cStartIdx).toBeGreaterThanOrEqual(0);
    expect(aCompleteIdx).toBeGreaterThanOrEqual(0);
    // c was started before a finished — work-stealing in action
    const cStartEventIdx = events.findIndex(
      (e) => e.type === "node:start" && (e as { nodeId: string }).nodeId === "c",
    );
    const aCompleteEventIdx = events.findIndex(
      (e) => e.type === "node:complete" && (e as { nodeId: string }).nodeId === "a",
    );
    expect(cStartEventIdx).toBeLessThan(aCompleteEventIdx);

    // All nodes should have run
    expect(nodeCompletes).toContain("a");
    expect(nodeCompletes).toContain("b");
    expect(nodeCompletes).toContain("c");
    expect(nodeCompletes).toContain("d");

    // Final result
    const graphComplete = events.find((e) => e.type === "graph:complete") as Extract<
      GraphStreamEvent,
      { type: "graph:complete" }
    >;
    expect(graphComplete).toBeDefined();
  });

  // ── Budget controller: soft limit emits warning ──

  it("budget controller emits warning at soft limit", async () => {
    // Budget 10_000, soft at 80% = 8_000
    // Node a uses 7_000 tokens (under soft), node b uses 2_000 (total 9_000, over soft)
    const a = tokenNode("a", { input: 3500, output: 3500 });
    const b = tokenNode("b", { input: 1000, output: 1000 });

    const nodes = new Map([["a", a], ["b", b]]);
    const edges = new Map([["b", ["a"]]]);
    const forks = new Map();

    const executor = new GraphExecutor(
      nodes, edges, forks, defaultConfig({ maxTokenBudget: 10_000 }),
      new SharedContext(new VirtualFilesystem()),
    );

    const events = await collectEvents(executor.stream("prompt"));
    const warnings = events.filter((e) => e.type === "budget:warning");

    // After b completes, total = 9_000 which is 90% > 80% soft limit
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const warning = warnings[0] as Extract<GraphStreamEvent, { type: "budget:warning" }>;
    expect(warning.threshold).toBe("soft");
    expect(warning.used).toBeGreaterThan(0);
  });

  // ── Budget controller: hard limit causes error ──

  it("budget controller stops execution at hard limit (token budget exceeded)", async () => {
    const a = tokenNode("a", { input: 500_000, output: 600_000 });
    const b = tokenNode("b", { input: 100, output: 100 });

    const nodes = new Map([["a", a], ["b", b]]);
    const edges = new Map([["b", ["a"]]]);
    const forks = new Map();

    const executor = new GraphExecutor(
      nodes, edges, forks, defaultConfig({ maxTokenBudget: 100_000 }),
      new SharedContext(new VirtualFilesystem()),
    );

    await expect(executor.execute("prompt")).rejects.toThrow("budget exceeded");
  });

  // ── Event-driven scheduling: no polling ──

  it("push-based scheduling: successors fire immediately on completion", async () => {
    // Chain a→b→c: each node fires its successor without polling
    const a = mockNode("a");
    const b = mockNode("b");
    const c = mockNode("c");

    const nodes = new Map([["a", a], ["b", b], ["c", c]]);
    const edges = new Map([["b", ["a"]], ["c", ["b"]]]);
    const forks = new Map();

    const executor = new GraphExecutor(
      nodes, edges, forks, defaultConfig(),
      new SharedContext(new VirtualFilesystem()),
    );

    const events = await collectEvents(executor.stream("prompt"));
    const types = events.map((e) => e.type);

    // Events should follow strict order: start→complete per node
    expect(types[0]).toBe("graph:start");
    expect(types[types.length - 1]).toBe("graph:complete");

    // Verify sequential execution: a completes before b starts
    const nodeEvents = events.filter(
      (e) => e.type === "node:start" || e.type === "node:complete",
    ) as Array<{ type: string; nodeId: string }>;

    const aComplete = nodeEvents.findIndex(
      (e) => e.type === "node:complete" && e.nodeId === "a",
    );
    const bStart = nodeEvents.findIndex(
      (e) => e.type === "node:start" && e.nodeId === "b",
    );
    const bComplete = nodeEvents.findIndex(
      (e) => e.type === "node:complete" && e.nodeId === "b",
    );
    const cStart = nodeEvents.findIndex(
      (e) => e.type === "node:start" && e.nodeId === "c",
    );

    expect(aComplete).toBeLessThan(bStart);
    expect(bComplete).toBeLessThan(cStart);
  });

  // ── Fork with partial results ──

  it("fork emits partial result events", async () => {
    const forkNode0 = mockNode("f__fork_0", "fork-out-0");
    const forkNode1 = mockNode("f__fork_1", "fork-out-1");
    const placeholder = mockNode("f");

    const nodes = new Map([["f", placeholder]]);
    const edges = new Map<string, string[]>();
    const forks = new Map([
      ["f", { nodes: [forkNode0, forkNode1] }],
    ]);

    const executor = new GraphExecutor(
      nodes, edges, forks, defaultConfig(),
      new SharedContext(new VirtualFilesystem()),
    );

    const events = await collectEvents(executor.stream("prompt"));
    const types = events.map((e) => e.type);

    expect(types).toContain("fork:start");
    expect(types).toContain("fork:complete");
    expect(types).toContain("fork:partial");

    const partials = events.filter(
      (e) => e.type === "fork:partial",
    ) as Array<Extract<GraphStreamEvent, { type: "fork:partial" }>>;
    expect(partials.length).toBeGreaterThanOrEqual(1);
    expect(partials[0]!.forkId).toBe("f");
  });

  // ── Concurrent execution: wide DAG uses all worker slots ──

  it("wide DAG uses concurrent workers", async () => {
    // 5 independent nodes: all should start before any completes (with 5 workers)
    const nodes = new Map<string, AgentNode>();
    for (let i = 0; i < 5; i++) {
      nodes.set(`n${i}`, mockNode(`n${i}`, `out-${i}`, 50));
    }
    const edges = new Map<string, string[]>();
    const forks = new Map();

    const executor = new GraphExecutor(
      nodes, edges, forks, defaultConfig({ maxConcurrency: 5 }),
      new SharedContext(new VirtualFilesystem()),
    );

    const startTime = Date.now();
    const result = await executor.execute("prompt");
    const elapsed = Date.now() - startTime;

    // With 5 concurrent workers, 5 nodes × 50ms should complete in ~50ms, not 250ms
    expect(elapsed).toBeLessThan(200);
    expect(Object.keys(result.nodeResults)).toHaveLength(5);
  });

  // ── Timeout still works ──

  it("graph-level timeout terminates execution", async () => {
    const a = mockNode("a", "out-a", 200);

    const nodes = new Map([["a", a]]);
    const edges = new Map<string, string[]>();
    const forks = new Map();

    const executor = new GraphExecutor(
      nodes, edges, forks, defaultConfig({ timeoutMs: 20 }),
      new SharedContext(new VirtualFilesystem()),
    );

    await expect(executor.execute("prompt")).rejects.toThrow("timed out");
  });

  // ── Diamond DAG correctness ──

  it("diamond DAG produces correct result", async () => {
    //    a
    //   / \
    //  b   c
    //   \ /
    //    d
    const a = mockNode("a");
    const b = mockNode("b");
    const c = mockNode("c");
    const d = mockNode("d");

    const nodes = new Map([["a", a], ["b", b], ["c", c], ["d", d]]);
    const edges = new Map([
      ["b", ["a"]],
      ["c", ["a"]],
      ["d", ["b", "c"]],
    ]);
    const forks = new Map();

    const executor = new GraphExecutor(
      nodes, edges, forks, defaultConfig(),
      new SharedContext(new VirtualFilesystem()),
    );

    const result = await executor.execute("prompt");
    expect(result.output).toBe("output-d");
    expect(Object.keys(result.nodeResults)).toHaveLength(4);

    // Verify d only ran after b and c
    const dMock = d.run as ReturnType<typeof vi.fn>;
    const bMock = b.run as ReturnType<typeof vi.fn>;
    const cMock = c.run as ReturnType<typeof vi.fn>;
    expect(bMock.mock.invocationCallOrder[0]).toBeLessThan(
      dMock.mock.invocationCallOrder[0]!,
    );
    expect(cMock.mock.invocationCallOrder[0]).toBeLessThan(
      dMock.mock.invocationCallOrder[0]!,
    );
  });
});
