import { describe, it, expect } from "vitest";
import { AcpServer } from "../../protocols/acp/acp-server.js";
import type { AcpHandler, AcpSession } from "../../ports/acp.port.js";
import { ScorerPipeline, exactMatchScorer, containsScorer, lengthScorer, llmJudgeScorer, createScorer } from "../../evals/scorer.js";
import { TrajectoryRecorder, hasAgentSteps, hasToolCallRequests, hasNoErrors, hasToolCallCount, completedWithin, hasOrderedSteps, exportTrajectory, importTrajectory } from "../../evals/trajectory.js";
import { SummarizationMiddleware } from "../../middleware/summarization.js";
import { ProgressEmitter } from "../../agent/progress.js";

// ============= ACP Server Tests =============

describe("AcpServer", () => {
  const echoHandler: AcpHandler = {
    async handle(method: string, params: unknown, session: AcpSession) {
      return { method, params, sessionId: session.id };
    },
  };

  it("handles initialize → method → shutdown lifecycle", async () => {
    const server = new AcpServer({ agentName: "test-agent" });
    server.registerHandler(echoHandler);

    // Initialize
    const init = await server.processMessage(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "acp/initialize", params: { workspace: "/tmp" },
    }));
    expect(init.result).toBeDefined();
    const sessionId = (init.result as Record<string, unknown>).sessionId as string;
    expect(sessionId).toBeTruthy();

    // Call method
    const call = await server.processMessage(JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "chat/send", params: { sessionId, message: "hello" },
    }));
    expect(call.result).toBeDefined();
    expect((call.result as Record<string, unknown>).method).toBe("chat/send");

    // Shutdown
    const shut = await server.processMessage(JSON.stringify({
      jsonrpc: "2.0", id: 3, method: "acp/shutdown", params: { sessionId },
    }));
    expect((shut.result as Record<string, unknown>).ok).toBe(true);
  });

  it("returns parse error for invalid JSON", async () => {
    const server = new AcpServer({ agentName: "x" });
    const resp = await server.processMessage("not json");
    expect(resp.error?.code).toBe(-32700);
  });

  it("returns error for missing method", async () => {
    const server = new AcpServer({ agentName: "x" });
    const resp = await server.processMessage(JSON.stringify({ jsonrpc: "2.0", id: 1 }));
    expect(resp.error?.code).toBe(-32600);
  });

  it("returns error for unknown session", async () => {
    const server = new AcpServer({ agentName: "x" });
    server.registerHandler(echoHandler);
    const resp = await server.processMessage(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "chat/send", params: { sessionId: "nope" },
    }));
    expect(resp.error?.code).toBe(-32602);
  });

  it("returns error when no handler registered", async () => {
    const server = new AcpServer({ agentName: "x" });
    // Init first
    await server.processMessage(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "acp/initialize" }));
    const resp = await server.processMessage(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "chat/send", params: { sessionId: "nope" },
    }));
    expect(resp.error).toBeDefined();
  });
});

// ============= Scorer Pipeline Tests =============

describe("ScorerPipeline", () => {
  it("runs multiple scorers in parallel", async () => {
    const pipeline = new ScorerPipeline();
    pipeline.addScorer(exactMatchScorer);
    pipeline.addScorer(containsScorer);
    const results = await pipeline.run("hello world", "hello world");
    expect(results.exact_match.score).toBe(1);
    expect(results.contains.score).toBe(1);
  });

  it("exact match fails on mismatch", async () => {
    const pipeline = new ScorerPipeline();
    pipeline.addScorer(exactMatchScorer);
    const results = await pipeline.run("foo", "bar");
    expect(results.exact_match.score).toBe(0);
  });

  it("contains scorer works", async () => {
    const pipeline = new ScorerPipeline();
    pipeline.addScorer(containsScorer);
    const results = await pipeline.run("hello beautiful world", "beautiful");
    expect(results.contains.score).toBe(1);
  });

  it("length scorer penalizes short text", async () => {
    const pipeline = new ScorerPipeline();
    pipeline.addScorer(lengthScorer);
    const results = await pipeline.run("hi", undefined, { metadata: { minLength: 10 } });
    expect(results.length.score).toBeLessThan(1);
  });

  it("llm judge scorer uses context.judge", async () => {
    const pipeline = new ScorerPipeline();
    pipeline.addScorer(llmJudgeScorer);
    const results = await pipeline.run("great answer", "expected", {
      judge: async () => 0.9,
    });
    expect(results.llm_judge.score).toBe(0.9);
  });

  it("runs preprocessing steps before scoring", async () => {
    const pipeline = new ScorerPipeline();
    pipeline.addStep({ name: "uppercase", execute: async (input) => (input as string).toUpperCase() });
    pipeline.addScorer(exactMatchScorer);
    const results = await pipeline.run("hello", "HELLO");
    expect(results.exact_match.score).toBe(1);
  });

  it("createScorer factory works", async () => {
    const custom = createScorer({
      name: "custom",
      async score(input) { return { score: input.length > 5 ? 1 : 0, reason: "len check" }; },
    });
    const pipeline = new ScorerPipeline();
    pipeline.addScorer(custom);
    const results = await pipeline.run("short");
    expect(results.custom.score).toBe(0);
  });
});

// ============= Trajectory Tests =============

describe("TrajectoryRecorder", () => {
  it("records and completes trajectory", () => {
    const recorder = new TrajectoryRecorder("agent-1");
    recorder.record({ type: "agent_start" });
    recorder.record({ type: "tool_call", name: "search", input: "query" });
    recorder.record({ type: "tool_result", name: "search", output: "result" });
    recorder.record({ type: "agent_response", output: "done" });
    const traj = recorder.complete();
    expect(traj.agentName).toBe("agent-1");
    expect(traj.steps).toHaveLength(4);
    expect(traj.completedAt).toBeDefined();
  });

  it("snapshot returns current state without completing", () => {
    const recorder = new TrajectoryRecorder("a");
    recorder.record({ type: "agent_start" });
    const snap = recorder.snapshot();
    expect(snap.completedAt).toBeUndefined();
    expect(snap.steps).toHaveLength(1);
  });
});

describe("Trajectory assertions", () => {
  const trajectory = {
    agentName: "test",
    steps: [
      { type: "agent_start" as const, timestamp: 1000 },
      { type: "tool_call" as const, name: "search", timestamp: 1010 },
      { type: "tool_result" as const, name: "search", timestamp: 1020 },
      { type: "tool_call" as const, name: "write", timestamp: 1030 },
      { type: "tool_result" as const, name: "write", timestamp: 1040 },
      { type: "agent_response" as const, timestamp: 1050 },
    ],
    startedAt: 1000,
    completedAt: 1050,
  };

  it("hasAgentSteps", () => {
    expect(hasAgentSteps(trajectory, 5)).toBe(true);
    expect(hasAgentSteps(trajectory, 10)).toBe(false);
  });

  it("hasToolCallRequests", () => {
    expect(hasToolCallRequests(trajectory, ["search", "write"])).toBe(true);
    expect(hasToolCallRequests(trajectory, ["missing"])).toBe(false);
  });

  it("hasNoErrors", () => {
    expect(hasNoErrors(trajectory)).toBe(true);
  });

  it("hasToolCallCount", () => {
    expect(hasToolCallCount(trajectory, "search", 1)).toBe(true);
    expect(hasToolCallCount(trajectory, "search", 2)).toBe(false);
  });

  it("completedWithin", () => {
    expect(completedWithin(trajectory, 100)).toBe(true);
    expect(completedWithin(trajectory, 10)).toBe(false);
  });

  it("hasOrderedSteps", () => {
    expect(hasOrderedSteps(trajectory, ["agent_start", "tool_call", "agent_response"])).toBe(true);
    expect(hasOrderedSteps(trajectory, ["agent_response", "agent_start"])).toBe(false);
  });

  it("export/import round-trip", () => {
    const json = exportTrajectory(trajectory);
    const imported = importTrajectory(json);
    expect(imported).toEqual(trajectory);
  });
});

// ============= Summarization Middleware Tests =============

describe("SummarizationMiddleware", () => {
  it("triggers on message count threshold", async () => {
    let summarized = false;
    const mw = new SummarizationMiddleware({
      messageThreshold: 3,
      summarize: async (msgs) => { summarized = true; return `Summary of ${msgs.length} msgs`; },
    });
    const ctx = { sessionId: "s1", agentName: "a", timestamp: Date.now(), metadata: {
      messages: ["msg1", "msg2", "msg3", "msg4"],
    } };
    await mw.beforeAgent({ prompt: "test" }, ctx);
    expect(summarized).toBe(true);
    const msgs = ctx.metadata.messages as string[];
    expect(msgs[0]).toContain("[Summary of");
  });

  it("does not trigger below threshold", async () => {
    let summarized = false;
    const mw = new SummarizationMiddleware({
      messageThreshold: 10,
      summarize: async () => { summarized = true; return "x"; },
    });
    const ctx = { sessionId: "s1", agentName: "a", timestamp: Date.now(), metadata: {
      messages: ["msg1", "msg2"],
    } };
    await mw.beforeAgent({ prompt: "test" }, ctx);
    expect(summarized).toBe(false);
  });

  it("triggers on fraction threshold", async () => {
    const mw = new SummarizationMiddleware({
      fractionThreshold: 0.5,
      maxContextTokens: 100,
      estimateTokens: (t) => t.length,
      summarize: async () => "short",
    });
    // 5 messages of 15 chars each = 75 total > 50% of 100
    const ctx = { sessionId: "s1", agentName: "a", timestamp: Date.now(), metadata: {
      messages: ["a".repeat(15), "b".repeat(15), "c".repeat(15), "d".repeat(15), "e".repeat(15)],
    } };
    await mw.beforeAgent({ prompt: "test" }, ctx);
    const msgs = ctx.metadata.messages as string[];
    expect(msgs[0]).toContain("[Summary of");
  });

  it("keeps recent messages after summarization", async () => {
    const mw = new SummarizationMiddleware({
      messageThreshold: 3,
      summarize: async () => "summary",
    });
    const ctx = { sessionId: "s1", agentName: "a", timestamp: Date.now(), metadata: {
      messages: ["old1", "old2", "old3", "recent1", "recent2"],
    } };
    await mw.beforeAgent({ prompt: "test" }, ctx);
    const msgs = ctx.metadata.messages as string[];
    // Should keep ~20% = 2 recent messages
    expect(msgs.length).toBeLessThan(5);
    expect(msgs[msgs.length - 1]).toBe("recent2");
  });
});

// ============= Progress Emitter Tests =============

describe("ProgressEmitter", () => {
  it("emits events to listeners", () => {
    const emitter = new ProgressEmitter();
    const events: { type: string }[] = [];
    emitter.on((evt) => events.push(evt));
    emitter.emit({ type: "step_start", message: "go" });
    emitter.emit({ type: "step_complete", message: "done" });
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("step_start");
  });

  it("unsubscribe works", () => {
    const emitter = new ProgressEmitter();
    const events: unknown[] = [];
    const unsub = emitter.on((evt) => events.push(evt));
    emitter.emit({ type: "step_start", message: "1" });
    unsub();
    emitter.emit({ type: "step_start", message: "2" });
    expect(events).toHaveLength(1);
  });

  it("adds timestamp to events", () => {
    const emitter = new ProgressEmitter();
    let ts = 0;
    emitter.on((evt) => { ts = evt.timestamp; });
    emitter.emit({ type: "complete", message: "done" });
    expect(ts).toBeGreaterThan(0);
  });

  it("isolates listener errors", () => {
    const emitter = new ProgressEmitter();
    const events: unknown[] = [];
    emitter.on(() => { throw new Error("boom"); });
    emitter.on((evt) => events.push(evt));
    emitter.emit({ type: "complete", message: "ok" });
    expect(events).toHaveLength(1); // Second listener still runs
  });

  it("SSE generator emits events and terminates on complete", async () => {
    const emitter = new ProgressEmitter();
    const gen = emitter.sse();

    // Emit events asynchronously
    setTimeout(() => {
      emitter.emit({ type: "step_start", message: "go" });
      emitter.emit({ type: "complete", message: "done" });
    }, 10);

    const results: string[] = [];
    for await (const chunk of gen) {
      results.push(chunk);
    }
    expect(results).toHaveLength(2);
    expect(JSON.parse(results[0]).type).toBe("step_start");
    expect(JSON.parse(results[1]).type).toBe("complete");
  });
});
