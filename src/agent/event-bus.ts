// =============================================================================
// @giulio-leone/gaussflow-agent — HierarchicalEventBus
// =============================================================================

import type {
  AgentEvent,
  AgentEventHandler,
  AgentEventType,
} from "../types.js";

type EventKey = AgentEventType | "*";

/**
 * Portable event bus for agent lifecycle events.
 * Supports typed subscriptions, wildcard listeners, auto-filled metadata,
 * hierarchical parent/child relationships, bubbling, capturing, and anti-storm protection.
 */
export interface EventBusOptions {
  /** Maximum listeners allowed per event type (default: 100). */
  maxListenersPerEvent?: number;
  /** Maximum bubbled events per second from a single child (default: 100). */
  maxBubblesPerSecond?: number;
}

export class EventBus {
  private readonly sessionId: string;
  private readonly listeners = new Map<EventKey, Set<AgentEventHandler>>();
  private readonly maxListenersPerEvent: number;
  private readonly maxBubblesPerSecond: number;

  // Hierarchical relationships
  private parent: EventBus | null = null;
  private readonly children = new Map<string, EventBus>();
  private namespace: string | null = null;

  // Namespaced listeners: namespace -> Set<handler>
  private readonly namespacedListeners = new Map<string, Set<AgentEventHandler>>();

  // Anti-storm: track bubble counts per child per second window
  private readonly bubbleCounts = new Map<string, { count: number; windowStart: number }>();

  constructor(sessionId: string, options?: EventBusOptions) {
    this.sessionId = sessionId;
    this.maxListenersPerEvent = options?.maxListenersPerEvent ?? 100;
    this.maxBubblesPerSecond = options?.maxBubblesPerSecond ?? 100;
  }

  /** Subscribe to a specific event type or '*' for all events. Returns unsubscribe fn. */
  on(eventType: EventKey, handler: AgentEventHandler): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    if (set.size >= this.maxListenersPerEvent) {
      throw new Error(
        `EventBus: max listeners (${this.maxListenersPerEvent}) reached for "${String(eventType)}"`,
      );
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

  /** Emit an event, auto-filling timestamp and sessionId. Also bubbles to parent. */
  emit(type: AgentEventType, data?: unknown): void {
    const event: AgentEvent = {
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data,
    };

    this.dispatchLocal(event);
    this.bubbleToParent(event);
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

  // ===========================================================================
  // Hierarchical API
  // ===========================================================================

  /** Create a child bus with a given namespace. */
  createChild(childNamespace: string): EventBus {
    if (this.children.has(childNamespace)) {
      throw new Error(`EventBus: child namespace "${childNamespace}" already exists`);
    }
    const child = new EventBus(this.sessionId, {
      maxListenersPerEvent: this.maxListenersPerEvent,
      maxBubblesPerSecond: this.maxBubblesPerSecond,
    });
    child.parent = this;
    child.namespace = childNamespace;
    this.children.set(childNamespace, child);
    return child;
  }

  /** Broadcast an event from this bus to ALL children recursively (capturing phase). */
  broadcast(type: AgentEventType, data?: unknown): void {
    const event: AgentEvent = {
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data,
    };

    for (const child of this.children.values()) {
      child.dispatchLocal(event);
      child.broadcast(type, data);
    }
  }

  /** Subscribe to events bubbled from a specific child namespace. */
  onNamespaced(childNamespace: string, handler: AgentEventHandler): () => void {
    let set = this.namespacedListeners.get(childNamespace);
    if (!set) {
      set = new Set();
      this.namespacedListeners.set(childNamespace, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.namespacedListeners.delete(childNamespace);
    };
  }

  /** Get all child buses. */
  getChildren(): Map<string, EventBus> {
    return new Map(this.children);
  }

  /** Get the parent bus, or null for root. */
  getParent(): EventBus | null {
    return this.parent;
  }

  // ===========================================================================
  // Internal helpers
  // ===========================================================================

  /** Dispatch an event to local listeners (specific + wildcard). */
  private dispatchLocal(event: AgentEvent): void {
    const specific = this.listeners.get(event.type);
    if (specific) {
      for (const handler of specific) handler(event);
    }
    const wildcard = this.listeners.get("*");
    if (wildcard) {
      for (const handler of wildcard) handler(event);
    }
  }

  /** Bubble an event to the parent bus with _source and _bubbled metadata. */
  private bubbleToParent(event: AgentEvent): void {
    if (!this.parent || !this.namespace) return;

    // Anti-storm protection
    if (!this.parent.checkBubbleRate(this.namespace)) return;

    const bubbledData =
      typeof event.data === "object" && event.data !== null
        ? { ...event.data, _source: this.namespace, _bubbled: true }
        : { _value: event.data, _source: this.namespace, _bubbled: true };

    const bubbledEvent: AgentEvent = {
      type: event.type,
      timestamp: event.timestamp,
      sessionId: event.sessionId,
      data: bubbledData,
    };

    // Dispatch on the parent's local listeners
    this.parent.dispatchLocal(bubbledEvent);

    // Dispatch on the parent's namespaced listeners for this child
    const nsListeners = this.parent.namespacedListeners.get(this.namespace);
    if (nsListeners) {
      for (const handler of nsListeners) handler(bubbledEvent);
    }

    // Continue bubbling up
    this.parent.bubbleToParent(bubbledEvent);
  }

  /** Check if a child is within the allowed bubble rate. Returns true if allowed. */
  private checkBubbleRate(childNamespace: string): boolean {
    const now = Date.now();
    let tracker = this.bubbleCounts.get(childNamespace);

    if (!tracker || now - tracker.windowStart >= 1000) {
      tracker = { count: 0, windowStart: now };
      this.bubbleCounts.set(childNamespace, tracker);
    }

    tracker.count++;
    if (tracker.count > this.maxBubblesPerSecond) {
      if (tracker.count === this.maxBubblesPerSecond + 1) {
        console.warn(
          `EventBus: anti-storm — child "${childNamespace}" exceeded ${this.maxBubblesPerSecond} bubbles/sec, dropping events`,
        );
      }
      return false;
    }
    return true;
  }
}
