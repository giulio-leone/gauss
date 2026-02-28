// =============================================================================
// PlaygroundWS — WebSocket endpoint for real-time agent execution
// =============================================================================

/**
 * WebSocket message protocol for the Playground.
 *
 * Client → Server:
 *   { type: "run", agent: "name", prompt: "..." }
 *   { type: "cancel", runId: "..." }
 *
 * Server → Client:
 *   { type: "token", runId, token: "..." }
 *   { type: "tool_call", runId, tool: "name", args: {...} }
 *   { type: "tool_result", runId, tool: "name", result: {...}, durationMs }
 *   { type: "step", runId, index, text: "..." }
 *   { type: "done", runId, text: "...", stats: {...} }
 *   { type: "error", runId, message: "..." }
 */

import type { PlaygroundAgent } from "./playground-api.js";

export interface PlaygroundWSMessage {
  type: string;
  [key: string]: unknown;
}

export interface PlaygroundWSRunMessage {
  type: "run";
  agent: string;
  prompt: string;
  runId?: string;
}

export interface PlaygroundWSCancelMessage {
  type: "cancel";
  runId: string;
}

export interface PlaygroundWSConfig {
  agents: Record<string, PlaygroundAgent>;
  /** Optional: max concurrent runs per connection (default: 3) */
  maxConcurrent?: number;
}

/**
 * Creates a WebSocket message handler for the playground.
 * This is transport-agnostic — works with any WS library (ws, uWebSockets, Bun).
 *
 * Usage with `ws`:
 * ```ts
 * const handler = createPlaygroundWSHandler({ agents });
 * wss.on('connection', (ws) => {
 *   ws.on('message', (data) => handler.onMessage(data.toString(), (msg) => ws.send(JSON.stringify(msg))));
 *   ws.on('close', () => handler.onClose());
 * });
 * ```
 */
export function createPlaygroundWSHandler(config: PlaygroundWSConfig) {
  const { agents, maxConcurrent = 3 } = config;
  const activeRuns = new Map<string, AbortController>();
  let nextRunId = 1;

  function send(emit: (msg: PlaygroundWSMessage) => void, msg: PlaygroundWSMessage): void {
    try {
      emit(msg);
    } catch {
      // Client disconnected
    }
  }

  async function handleRun(
    msg: PlaygroundWSRunMessage,
    emit: (msg: PlaygroundWSMessage) => void,
  ): Promise<void> {
    const agent = agents[msg.agent];
    if (!agent) {
      send(emit, { type: "error", runId: msg.runId ?? "", message: `Agent "${msg.agent}" not found` });
      return;
    }

    if (activeRuns.size >= maxConcurrent) {
      send(emit, { type: "error", runId: msg.runId ?? "", message: "Max concurrent runs reached" });
      return;
    }

    const runId = msg.runId ?? `run-${nextRunId++}`;
    const controller = new AbortController();
    activeRuns.set(runId, controller);

    try {
      const result = await agent.invoke(msg.prompt, { stream: true });

      if (typeof result === "string") {
        send(emit, { type: "token", runId, token: result });
        send(emit, { type: "done", runId, text: result, stats: {} });
      } else {
        // Streaming response
        let fullText = "";
        for await (const chunk of result) {
          if (controller.signal.aborted) break;
          fullText += chunk;
          send(emit, { type: "token", runId, token: chunk });
        }
        send(emit, { type: "done", runId, text: fullText, stats: {} });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(emit, { type: "error", runId, message });
    } finally {
      activeRuns.delete(runId);
    }
  }

  return {
    onMessage(
      raw: string,
      emit: (msg: PlaygroundWSMessage) => void,
    ): void {
      let msg: PlaygroundWSMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        send(emit, { type: "error", runId: "", message: "Invalid JSON" });
        return;
      }

      if (msg.type === "run") {
        void handleRun(msg as unknown as PlaygroundWSRunMessage, emit);
      } else if (msg.type === "cancel") {
        const cancelMsg = msg as unknown as PlaygroundWSCancelMessage;
        const controller = activeRuns.get(cancelMsg.runId);
        if (controller) {
          controller.abort();
          activeRuns.delete(cancelMsg.runId);
          send(emit, { type: "done", runId: cancelMsg.runId, text: "[cancelled]", stats: {} });
        }
      } else {
        send(emit, { type: "error", runId: "", message: `Unknown message type: ${msg.type}` });
      }
    },

    onClose(): void {
      // Cancel all active runs on disconnect
      for (const [, controller] of activeRuns) {
        controller.abort();
      }
      activeRuns.clear();
    },

    get activeRunCount(): number {
      return activeRuns.size;
    },
  };
}
