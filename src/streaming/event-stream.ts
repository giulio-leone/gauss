// =============================================================================
// Event Stream — Wraps EventBus into a Web ReadableStream for SSE consumption
// =============================================================================

import type { EventBus } from "../agent/event-bus.js";
import type { AgentEvent } from "../types.js";
import { createDeltaEncoder } from "./delta-encoder.js";

export interface EventStreamOptions {
  /** Filter to specific event types. Default: all ("*"). */
  eventTypes?: string[];
  /** "full" sends every event as-is; "delta" uses delta encoding. */
  mode?: "full" | "delta";
  /** How to handle backpressure: 'drop' (default) discards events, 'buffer' keeps last N. */
  backpressureStrategy?: "drop" | "buffer";
  /** Max events to buffer when using 'buffer' strategy (default: 100). */
  bufferSize?: number;
}

/**
 * Creates a ReadableStream of SSE-formatted strings from an EventBus.
 */
export function createEventStream(
  eventBus: EventBus,
  options?: EventStreamOptions,
): ReadableStream<string> {
  const mode = options?.mode ?? "full";
  const eventTypes = options?.eventTypes;
  const encoder = mode === "delta" ? createDeltaEncoder() : null;
  const backpressureStrategy = options?.backpressureStrategy ?? "drop";
  const bufferSize = options?.bufferSize ?? 100;
  let id = 0;
  let droppedEvents = 0;
  let isEmitting = false;
  const buffer: string[] = [];

  const unsubscribes: (() => void)[] = [];

  return new ReadableStream<string>({
    start(controller) {
      const handler = (event: AgentEvent) => {
        // Re-entrancy guard: skip events triggered by our own emit
        if (isEmitting) return;

        let data: string;
        if (encoder) {
          const encoded = encoder.encode(event);
          if (encoded === null) return;
          data = encoded;
        } else {
          data = JSON.stringify(event);
        }

        id++;
        const chunk = `id: ${id}\nevent: ${event.type}\ndata: ${data}\n\n`;

        // Backpressure handling
        if ((controller.desiredSize ?? 1) <= 0) {
          if (backpressureStrategy === "buffer") {
            buffer.push(chunk);
            while (buffer.length > bufferSize) buffer.shift();
          } else {
            droppedEvents++;
            if (droppedEvents % 10 === 0) {
              isEmitting = true;
              try {
                eventBus.emit("stream:warning" as any, {
                  reason: "backpressure",
                  droppedEvents,
                });
              } finally {
                isEmitting = false;
              }
            }
          }
          return;
        }

        // Flush buffer first, respecting backpressure
        while (buffer.length > 0 && (controller.desiredSize ?? 1) > 0) {
          controller.enqueue(buffer.shift()!);
        }
        if ((controller.desiredSize ?? 1) > 0) {
          controller.enqueue(chunk);
        } else {
          buffer.push(chunk);
        }
      };

      if (eventTypes && eventTypes.length > 0) {
        for (const type of eventTypes) {
          unsubscribes.push(eventBus.on(type as any, handler));
        }
      } else {
        unsubscribes.push(eventBus.on("*", handler));
      }
    },

    cancel() {
      for (const unsub of unsubscribes) unsub();
    },
  });
}
