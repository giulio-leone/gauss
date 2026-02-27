// =============================================================================
// Streaming Progress Events — Typed event schema + emitter
// =============================================================================

export type ProgressPhase =
  | "plan_start" | "plan_complete"
  | "step_start" | "step_complete"
  | "tool_call" | "tool_result"
  | "agent_thinking" | "agent_response"
  | "complete" | "error";

export interface ProgressEvent {
  type: ProgressPhase;
  step?: number;
  totalSteps?: number;
  progress?: number; // 0-100
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export type ProgressListener = (event: ProgressEvent) => void;

export class ProgressEmitter {
  private listeners: ProgressListener[] = [];

  on(listener: ProgressListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(event: Omit<ProgressEvent, "timestamp">): void {
    const full: ProgressEvent = { ...event, timestamp: Date.now() };
    for (const listener of this.listeners) {
      try { listener(full); } catch { /* isolated */ }
    }
  }

  /** Create an SSE async generator for HTTP streaming */
  async *sse(): AsyncGenerator<string> {
    const queue: ProgressEvent[] = [];
    let notify: (() => void) | null = null;

    const unsub = this.on((evt) => {
      queue.push(evt);
      notify?.();
    });

    try {
      while (true) {
        // Drain all queued events
        while (queue.length > 0) {
          const evt = queue.shift()!;
          yield JSON.stringify(evt);
          if (evt.type === "complete" || evt.type === "error") return;
        }
        // Wait for next event; if one arrives between check and await, notify resolves immediately
        await new Promise<void>(r => { notify = r; });
        notify = null;
      }
    } finally {
      unsub();
    }
  }
}
