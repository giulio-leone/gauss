import { describe, expect, it, beforeEach } from "vitest";
import { DebugSessionImpl } from "../debug-session.js";
import { InMemoryAgentDebuggerAdapter } from "../debugger.adapter.js";
import { DebugMiddleware } from "../debug-middleware.js";
import type {
  DebugCheckpoint,
  DebugState,
  BreakpointCondition,
} from "../../../ports/agent-debugger.port.js";
import type { MiddlewareContext } from "../../../ports/middleware.port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<DebugState> = {}): DebugState {
  return {
    messages: [],
    toolCalls: [],
    tokenCount: 0,
    costEstimate: 0,
    elapsedMs: 0,
    metadata: {},
    ...overrides,
  };
}

function makeCtx(sessionId = "s1"): MiddlewareContext {
  return { sessionId, timestamp: Date.now(), metadata: {} };
}

// ---------------------------------------------------------------------------
// Adapter tests
// ---------------------------------------------------------------------------

describe("InMemoryAgentDebuggerAdapter", () => {
  let adapter: InMemoryAgentDebuggerAdapter;

  beforeEach(() => {
    adapter = new InMemoryAgentDebuggerAdapter();
  });

  it("startSession creates a new debug session", () => {
    const session = adapter.startSession("agent-1", "Hello");
    expect(session.id).toBeTruthy();
    expect(session.agentId).toBe("agent-1");
    expect(session.prompt).toBe("Hello");
    expect(session.checkpoints).toHaveLength(0);
  });

  it("listSessions returns all sessions", () => {
    adapter.startSession("a1", "p1");
    adapter.startSession("a2", "p2");
    const list = adapter.listSessions();
    expect(list).toHaveLength(2);
    expect(list[0].agentId).toBe("a1");
    expect(list[1].agentId).toBe("a2");
  });

  it("loadSession retrieves by ID", () => {
    const created = adapter.startSession("a1", "p1");
    const loaded = adapter.loadSession(created.id);
    expect(loaded.id).toBe(created.id);
  });

  it("loadSession throws for unknown ID", () => {
    expect(() => adapter.loadSession("nope")).toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// DebugSession tests
// ---------------------------------------------------------------------------

describe("DebugSessionImpl", () => {
  let session: DebugSessionImpl;

  beforeEach(() => {
    session = new DebugSessionImpl("test-1", "agent-1", "Hello world");
  });

  it("stepForward navigates forward", () => {
    session.addCheckpoint("agent_start", {}, makeState());
    session.addCheckpoint("tool_call", { toolName: "search" }, makeState());
    session.goto(0);
    const next = session.stepForward();
    expect(next).not.toBeNull();
    expect(next!.type).toBe("tool_call");
    expect(session.currentIndex()).toBe(1);
  });

  it("stepForward returns null at end", () => {
    session.addCheckpoint("agent_start", {}, makeState());
    expect(session.stepForward()).toBeNull();
  });

  it("stepBackward navigates backward", () => {
    session.addCheckpoint("agent_start", {}, makeState());
    session.addCheckpoint("tool_call", {}, makeState());
    const prev = session.stepBackward();
    expect(prev).not.toBeNull();
    expect(prev!.type).toBe("agent_start");
    expect(session.currentIndex()).toBe(0);
  });

  it("stepBackward returns null at start", () => {
    session.addCheckpoint("agent_start", {}, makeState());
    session.goto(0);
    expect(session.stepBackward()).toBeNull();
  });

  it("goto jumps to specific checkpoint", () => {
    session.addCheckpoint("agent_start", {}, makeState());
    session.addCheckpoint("tool_call", {}, makeState());
    session.addCheckpoint("agent_end", {}, makeState());
    const cp = session.goto(1);
    expect(cp.type).toBe("tool_call");
    expect(session.currentIndex()).toBe(1);
  });

  it("goto throws for out-of-range index", () => {
    session.addCheckpoint("agent_start", {}, makeState());
    expect(() => session.goto(5)).toThrow(/out of range/i);
    expect(() => session.goto(-1)).toThrow(/out of range/i);
  });

  it("branch creates new session from current point", () => {
    session.addCheckpoint("agent_start", {}, makeState());
    session.addCheckpoint("tool_call", { toolName: "search" }, makeState());
    session.addCheckpoint("tool_result", {}, makeState());

    session.goto(1); // position at tool_call
    const branched = session.branch({ data: { toolName: "modified" } });

    expect(branched.id).toContain("branch");
    expect(branched.checkpoints).toHaveLength(2); // agent_start + modified tool_call
    expect(branched.checkpoints[1].data["toolName"]).toBe("modified");
    // Original unchanged
    expect(session.checkpoints[1].data["toolName"]).toBe("search");
  });

  it("addBreakpoint and removeBreakpoint management", () => {
    const id = session.addBreakpoint({ type: "tool_call" });
    expect(id).toBeTruthy();
    session.removeBreakpoint(id);
    // After removal, no breakpoint should match
    const cp: DebugCheckpoint = {
      index: 0,
      timestamp: Date.now(),
      type: "tool_call",
      data: {},
      state: makeState(),
    };
    expect(session.checkBreakpoints(cp)).toBeNull();
  });

  it("checkBreakpoints matches tool_call breakpoint", () => {
    session.addBreakpoint({ type: "tool_call", toolName: "search" });
    const cp: DebugCheckpoint = {
      index: 0,
      timestamp: Date.now(),
      type: "tool_call",
      data: { toolName: "search" },
      state: makeState(),
    };
    const hit = session.checkBreakpoints(cp);
    expect(hit).not.toBeNull();
    expect(hit!.condition.toolName).toBe("search");
  });

  it("checkBreakpoints does not match wrong tool name", () => {
    session.addBreakpoint({ type: "tool_call", toolName: "search" });
    const cp: DebugCheckpoint = {
      index: 0,
      timestamp: Date.now(),
      type: "tool_call",
      data: { toolName: "other" },
      state: makeState(),
    };
    expect(session.checkBreakpoints(cp)).toBeNull();
  });

  it("checkBreakpoints matches token_threshold breakpoint", () => {
    session.addBreakpoint({ type: "token_threshold", threshold: 100 });
    const cp: DebugCheckpoint = {
      index: 0,
      timestamp: Date.now(),
      type: "llm_response",
      data: {},
      state: makeState({ tokenCount: 150 }),
    };
    const hit = session.checkBreakpoints(cp);
    expect(hit).not.toBeNull();
    expect(hit!.condition.type).toBe("token_threshold");
  });

  it("checkBreakpoints matches custom predicate", () => {
    const predicate = (cp: DebugCheckpoint) => cp.data["critical"] === true;
    session.addBreakpoint({ type: "custom", predicate });
    const cp: DebugCheckpoint = {
      index: 0,
      timestamp: Date.now(),
      type: "tool_call",
      data: { critical: true },
      state: makeState(),
    };
    const hit = session.checkBreakpoints(cp);
    expect(hit).not.toBeNull();
  });

  it("diff between two sessions finds differences", () => {
    session.addCheckpoint("agent_start", { a: 1 }, makeState({ tokenCount: 0 }));
    session.addCheckpoint("tool_call", { b: 2 }, makeState({ tokenCount: 50 }));

    const other = new DebugSessionImpl("test-2", "agent-1", "Hello");
    other.addCheckpoint("agent_start", { a: 1 }, makeState({ tokenCount: 0 }));
    other.addCheckpoint("tool_call", { b: 99 }, makeState({ tokenCount: 100 }));

    const diffs = session.diff(other);
    expect(diffs.length).toBeGreaterThan(0);
    const dataDiff = diffs.find(
      (d) => d.checkpointIndex === 1 && d.field === "data",
    );
    expect(dataDiff).toBeDefined();
    expect(dataDiff!.type).toBe("changed");
  });

  it("diff detects added checkpoints", () => {
    session.addCheckpoint("agent_start", {}, makeState());

    const other = new DebugSessionImpl("test-2", "agent-1", "Hello");
    other.addCheckpoint("agent_start", {}, makeState());
    other.addCheckpoint("tool_call", {}, makeState());

    const diffs = session.diff(other);
    const added = diffs.find((d) => d.type === "added");
    expect(added).toBeDefined();
  });

  it("serialize and deserialize roundtrip", () => {
    session.addCheckpoint("agent_start", { x: 1 }, makeState({ tokenCount: 42 }));
    session.addCheckpoint("tool_call", { y: 2 }, makeState({ tokenCount: 100 }));

    const json = session.serialize();
    const restored = DebugSessionImpl.deserialize(json);

    expect(restored.id).toBe(session.id);
    expect(restored.agentId).toBe(session.agentId);
    expect(restored.prompt).toBe(session.prompt);
    expect(restored.checkpoints).toHaveLength(2);
    expect(restored.checkpoints[0].state.tokenCount).toBe(42);
    expect(restored.currentIndex()).toBe(session.currentIndex());
  });
});

// ---------------------------------------------------------------------------
// Middleware tests
// ---------------------------------------------------------------------------

describe("DebugMiddleware", () => {
  let adapter: InMemoryAgentDebuggerAdapter;
  let middleware: DebugMiddleware;
  let ctx: MiddlewareContext;

  beforeEach(() => {
    adapter = new InMemoryAgentDebuggerAdapter();
    middleware = new DebugMiddleware(adapter);
    ctx = makeCtx("mw-session-1");

    const debugSession = adapter.startSession("agent-1", "Hello");
    middleware.bindSession("mw-session-1", debugSession.id);
  });

  function getCheckpoints() {
    const sessions = adapter.listSessions();
    const s = adapter.loadSession(sessions[0].id) as DebugSessionImpl;
    return s.checkpoints;
  }

  it("records agent_start checkpoint via beforeAgent", async () => {
    await middleware.beforeAgent(ctx, {
      prompt: "Hello",
      instructions: "Be helpful",
      tools: {},
    });
    const cps = getCheckpoints();
    expect(cps).toHaveLength(1);
    expect(cps[0].type).toBe("agent_start");
    expect(cps[0].data["prompt"]).toBe("Hello");
  });

  it("records tool_call and tool_result checkpoints", async () => {
    await middleware.beforeTool(ctx, {
      toolName: "search",
      args: { q: "test" },
      stepIndex: 0,
    });
    await middleware.afterTool(ctx, {
      toolName: "search",
      args: { q: "test" },
      result: { found: true },
      stepIndex: 0,
      durationMs: 42,
    });
    const cps = getCheckpoints();
    expect(cps).toHaveLength(2);
    expect(cps[0].type).toBe("tool_call");
    expect(cps[1].type).toBe("tool_result");
    expect(cps[1].state.toolCalls).toHaveLength(1);
    expect(cps[1].state.toolCalls[0].name).toBe("search");
  });

  it("records agent_end checkpoint via afterAgent", async () => {
    await middleware.afterAgent(ctx, {
      prompt: "Hello",
      result: { text: "World", steps: [], sessionId: "s1" },
    });
    const cps = getCheckpoints();
    expect(cps).toHaveLength(1);
    expect(cps[0].type).toBe("agent_end");
  });

  it("records error checkpoint via onError", async () => {
    await middleware.onError(ctx, {
      error: new Error("boom"),
      phase: "beforeTool",
      middlewareName: "some-mw",
    });
    const cps = getCheckpoints();
    expect(cps).toHaveLength(1);
    expect(cps[0].type).toBe("error");
    expect(cps[0].data["error"]).toBe("boom");
  });

  it("state accumulation tracks tokens and cost", async () => {
    middleware.recordUsage("mw-session-1", 100, 0.01);

    await middleware.beforeTool(ctx, {
      toolName: "search",
      args: {},
      stepIndex: 0,
    });

    const cps = getCheckpoints();
    expect(cps[0].state.tokenCount).toBe(100);
    expect(cps[0].state.costEstimate).toBe(0.01);
  });
});
