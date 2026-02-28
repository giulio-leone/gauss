// =============================================================================
// Execution Replay — Record and replay full agent runs deterministically
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeAgentParams,
  BeforeAgentResult,
  AfterAgentParams,
  AfterAgentResult,
  BeforeToolCallParams,
  BeforeToolCallResult,
  AfterToolCallParams,
  AfterToolCallResult,
} from "../../ports/middleware.port.js";
import { MiddlewarePriority } from "../../ports/middleware.port.js";

// =============================================================================
// Recording types
// =============================================================================

export interface ReplayEvent {
  type: "agent_start" | "agent_end" | "tool_start" | "tool_end";
  timestamp: number;
  data: unknown;
}

export interface ExecutionRecording {
  id: string;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  events: ReplayEvent[];
  metadata: Record<string, unknown>;
}

// =============================================================================
// Recorder — Records agent execution into a serializable recording
// =============================================================================

export function createRecorderMiddleware(): MiddlewarePort & {
  getRecording(): ExecutionRecording;
  reset(): void;
} {
  let recording: ExecutionRecording = {
    id: `rec-${Date.now()}`,
    sessionId: "",
    startedAt: Date.now(),
    events: [],
    metadata: {},
  };

  const middleware: MiddlewarePort & {
    getRecording(): ExecutionRecording;
    reset(): void;
  } = {
    name: "gauss:execution-recorder",
    priority: MiddlewarePriority.FIRST,

    beforeAgent(ctx: MiddlewareContext, params: BeforeAgentParams): BeforeAgentResult | void {
      recording.sessionId = ctx.sessionId;
      recording.events.push({
        type: "agent_start",
        timestamp: Date.now(),
        data: { prompt: params.prompt, instructions: params.instructions },
      });
    },

    afterAgent(_ctx: MiddlewareContext, params: AfterAgentParams): AfterAgentResult | void {
      recording.events.push({
        type: "agent_end",
        timestamp: Date.now(),
        data: { text: params.result.text, steps: params.result.steps.length },
      });
      recording.endedAt = Date.now();
    },

    beforeTool(_ctx: MiddlewareContext, params: BeforeToolCallParams): BeforeToolCallResult | void {
      recording.events.push({
        type: "tool_start",
        timestamp: Date.now(),
        data: { toolName: params.toolName, args: params.args, stepIndex: params.stepIndex },
      });
    },

    afterTool(_ctx: MiddlewareContext, params: AfterToolCallParams): AfterToolCallResult | void {
      recording.events.push({
        type: "tool_end",
        timestamp: Date.now(),
        data: {
          toolName: params.toolName,
          result: params.result,
          durationMs: params.durationMs,
        },
      });
    },

    getRecording() {
      return { ...recording, events: [...recording.events] };
    },

    reset() {
      recording = {
        id: `rec-${Date.now()}`,
        sessionId: "",
        startedAt: Date.now(),
        events: [],
        metadata: {},
      };
    },
  };

  return middleware;
}

// =============================================================================
// Replayer — Replays tool results from a recording
// =============================================================================

export function createReplayerMiddleware(
  recording: ExecutionRecording,
): MiddlewarePort & { replayedCount: number } {
  let toolIndex = 0;
  const toolEndEvents = recording.events.filter((e) => e.type === "tool_end");

  const middleware: MiddlewarePort & { replayedCount: number } = {
    name: "gauss:execution-replayer",
    priority: MiddlewarePriority.FIRST,
    replayedCount: 0,

    beforeTool(_ctx: MiddlewareContext, params: BeforeToolCallParams): BeforeToolCallResult | void {
      if (toolIndex < toolEndEvents.length) {
        const event = toolEndEvents[toolIndex];
        const data = event.data as { toolName: string; result: unknown };
        if (data.toolName === params.toolName) {
          toolIndex++;
          middleware.replayedCount++;
          return { skip: true, mockResult: data.result };
        }
      }
    },
  };

  return middleware;
}

// =============================================================================
// Serialization
// =============================================================================

export function serializeRecording(recording: ExecutionRecording): string {
  return JSON.stringify(recording, null, 2);
}

export function deserializeRecording(json: string): ExecutionRecording {
  return JSON.parse(json) as ExecutionRecording;
}
