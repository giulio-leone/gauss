// =============================================================================
// @giulio-leone/gaussflow-agent — EventBus
// =============================================================================

import type {
  AgentEvent,
  AgentEventHandler,
  AgentEventType,
} from "../types.js";

type EventKey = AgentEventType | "*";

/**
 * Portable event bus for agent lifecycle events.
 * Supports typed subscriptions, wildcard listeners, and auto-filled metadata.
 */
export class EventBus {
  private readonly sessionId: string;
  private readonly listeners = new Map<EventKey, Set<AgentEventHandler>>();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /** Subscribe to a specific event type or '*' for all events. Returns unsubscribe fn. */
  on(eventType: EventKey, handler: AgentEventHandler): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(handler);
    return () => this.off(eventType, handler);
  }

  /** Unsubscribe a handler from a specific event type. */
  off(eventType: EventKey, handler: AgentEventHandler): void {
    const set = this.listeners.get(eventType);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.listeners.delete(eventType);
  }

  /** Emit an event, auto-filling timestamp and sessionId. */
  emit(type: AgentEventType, data?: unknown): void {
    const event: AgentEvent = {
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data,
    };

    const specific = this.listeners.get(type);
    if (specific) {
      for (const handler of specific) handler(event);
    }

    const wildcard = this.listeners.get("*");
    if (wildcard) {
      for (const handler of wildcard) handler(event);
    }
  }

  /** Remove all listeners for a given event type, or all listeners if no type specified. */
  removeAllListeners(eventType?: EventKey): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /** Return the number of listeners for a given event type. */
  listenerCount(eventType: EventKey): number {
    return this.listeners.get(eventType)?.size ?? 0;
  }
}
