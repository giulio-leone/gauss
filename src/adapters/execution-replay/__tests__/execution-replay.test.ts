import { describe, it, expect } from "vitest";
import {
  createRecorderMiddleware,
  createReplayerMiddleware,
  serializeRecording,
  deserializeRecording,
} from "../execution-replay.js";
import type { MiddlewareContext } from "../../../ports/middleware.port.js";

const ctx: MiddlewareContext = {
  sessionId: "test-session",
  agentId: "agent-1",
  modelId: "gpt-4",
  startedAt: Date.now(),
  state: {},
};

describe("Execution Recorder", () => {
  it("records agent lifecycle events", () => {
    const recorder = createRecorderMiddleware();

    recorder.beforeAgent!(ctx, { prompt: "Hello", instructions: "Be helpful" } as any);
    recorder.afterAgent!(ctx, {
      result: { text: "Hi there", steps: [{ type: "text" }] },
    } as any);

    const recording = recorder.getRecording();
    expect(recording.events).toHaveLength(2);
    expect(recording.events[0].type).toBe("agent_start");
    expect(recording.events[1].type).toBe("agent_end");
    expect(recording.sessionId).toBe("test-session");
    expect(recording.endedAt).toBeGreaterThan(0);
  });

  it("records tool call events", () => {
    const recorder = createRecorderMiddleware();

    recorder.beforeTool!(ctx, { toolName: "search", args: { q: "test" }, stepIndex: 0 } as any);
    recorder.afterTool!(ctx, {
      toolName: "search",
      result: { data: [1, 2, 3] },
      durationMs: 42,
    } as any);

    const recording = recorder.getRecording();
    expect(recording.events).toHaveLength(2);
    expect(recording.events[0].type).toBe("tool_start");
    expect(recording.events[1].type).toBe("tool_end");
    expect((recording.events[1].data as any).durationMs).toBe(42);
  });

  it("reset clears recording", () => {
    const recorder = createRecorderMiddleware();

    recorder.beforeAgent!(ctx, { prompt: "test" } as any);
    expect(recorder.getRecording().events).toHaveLength(1);

    recorder.reset();
    expect(recorder.getRecording().events).toHaveLength(0);
  });

  it("getRecording returns a copy", () => {
    const recorder = createRecorderMiddleware();
    recorder.beforeAgent!(ctx, { prompt: "test" } as any);

    const r1 = recorder.getRecording();
    const r2 = recorder.getRecording();
    expect(r1).not.toBe(r2);
    expect(r1.events).not.toBe(r2.events);
    expect(r1.events).toEqual(r2.events);
  });
});

describe("Execution Replayer", () => {
  it("replays tool results from recording", () => {
    const recorder = createRecorderMiddleware();

    recorder.beforeTool!(ctx, { toolName: "calc", args: { x: 1 }, stepIndex: 0 } as any);
    recorder.afterTool!(ctx, { toolName: "calc", result: 42, durationMs: 10 } as any);
    recorder.beforeTool!(ctx, { toolName: "fetch", args: { url: "x" }, stepIndex: 1 } as any);
    recorder.afterTool!(ctx, { toolName: "fetch", result: "data", durationMs: 20 } as any);

    const recording = recorder.getRecording();
    const replayer = createReplayerMiddleware(recording);

    const r1 = replayer.beforeTool!(ctx, { toolName: "calc", args: { x: 1 }, stepIndex: 0 } as any);
    expect(r1).toEqual({ skip: true, mockResult: 42 });

    const r2 = replayer.beforeTool!(ctx, { toolName: "fetch", args: { url: "x" }, stepIndex: 1 } as any);
    expect(r2).toEqual({ skip: true, mockResult: "data" });

    expect(replayer.replayedCount).toBe(2);
  });

  it("returns undefined when tool name mismatch", () => {
    const recorder = createRecorderMiddleware();
    recorder.beforeTool!(ctx, { toolName: "calc", args: {}, stepIndex: 0 } as any);
    recorder.afterTool!(ctx, { toolName: "calc", result: 42, durationMs: 5 } as any);

    const replayer = createReplayerMiddleware(recorder.getRecording());
    const result = replayer.beforeTool!(ctx, { toolName: "other", args: {}, stepIndex: 0 } as any);
    expect(result).toBeUndefined();
    expect(replayer.replayedCount).toBe(0);
  });

  it("returns undefined when replay events exhausted", () => {
    const replayer = createReplayerMiddleware({
      id: "empty",
      sessionId: "s",
      startedAt: 0,
      events: [],
      metadata: {},
    });

    const result = replayer.beforeTool!(ctx, { toolName: "x", args: {}, stepIndex: 0 } as any);
    expect(result).toBeUndefined();
  });
});

describe("Serialization", () => {
  it("round-trips recording through JSON", () => {
    const recorder = createRecorderMiddleware();
    recorder.beforeAgent!(ctx, { prompt: "test" } as any);
    recorder.afterAgent!(ctx, { result: { text: "ok", steps: [] } } as any);

    const recording = recorder.getRecording();
    const json = serializeRecording(recording);
    const restored = deserializeRecording(json);

    expect(restored.id).toBe(recording.id);
    expect(restored.events).toHaveLength(2);
    expect(restored.events[0].type).toBe("agent_start");
  });
});
