import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../agent/event-bus.js";
import type { AgentEvent } from "../types.js";

describe("HierarchicalEventBus", () => {
  let root: EventBus;

  beforeEach(() => {
    root = new EventBus("session-1");
  });

  // ===========================================================================
  // Backward compatibility
  // ===========================================================================

  describe("Backward Compatibility", () => {
    it("on/off/emit work as before", () => {
      const handler = vi.fn();
      root.on("agent:start", handler);
      root.emit("agent:start", { foo: 1 });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({
        type: "agent:start",
        sessionId: "session-1",
        data: { foo: 1 },
      });
    });

    it("wildcard '*' receives all events", () => {
      const handler = vi.fn();
      root.on("*", handler);
      root.emit("agent:start");
      root.emit("agent:stop");
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("unsubscribe via returned function", () => {
      const handler = vi.fn();
      const unsub = root.on("agent:start", handler);
      unsub();
      root.emit("agent:start");
      expect(handler).not.toHaveBeenCalled();
    });

    it("off removes a handler", () => {
      const handler = vi.fn();
      root.on("agent:start", handler);
      root.off("agent:start", handler);
      root.emit("agent:start");
      expect(handler).not.toHaveBeenCalled();
    });

    it("removeAllListeners clears specific type", () => {
      root.on("agent:start", vi.fn());
      root.on("agent:start", vi.fn());
      root.removeAllListeners("agent:start");
      expect(root.listenerCount("agent:start")).toBe(0);
    });

    it("removeAllListeners() clears everything", () => {
      root.on("agent:start", vi.fn());
      root.on("agent:stop", vi.fn());
      root.removeAllListeners();
      expect(root.listenerCount("agent:start")).toBe(0);
      expect(root.listenerCount("agent:stop")).toBe(0);
    });

    it("listenerCount returns correct count", () => {
      root.on("agent:start", vi.fn());
      root.on("agent:start", vi.fn());
      expect(root.listenerCount("agent:start")).toBe(2);
      expect(root.listenerCount("agent:stop")).toBe(0);
    });

    it("throws on max listeners exceeded", () => {
      const bus = new EventBus("s1", { maxListenersPerEvent: 2 });
      bus.on("agent:start", vi.fn());
      bus.on("agent:start", vi.fn());
      expect(() => bus.on("agent:start", vi.fn())).toThrowError(
        /max listeners \(2\) reached/,
      );
    });
  });

  // ===========================================================================
  // Hierarchical: createChild, getParent, getChildren
  // ===========================================================================

  describe("Hierarchy", () => {
    it("createChild returns a child EventBus", () => {
      const child = root.createChild("worker-1");
      expect(child).toBeInstanceOf(EventBus);
    });

    it("getParent returns parent for child, null for root", () => {
      const child = root.createChild("worker-1");
      expect(child.getParent()).toBe(root);
      expect(root.getParent()).toBeNull();
    });

    it("getChildren returns all children", () => {
      const c1 = root.createChild("w1");
      const c2 = root.createChild("w2");
      const children = root.getChildren();
      expect(children.size).toBe(2);
      expect(children.get("w1")).toBe(c1);
      expect(children.get("w2")).toBe(c2);
    });

    it("throws on duplicate namespace", () => {
      root.createChild("w1");
      expect(() => root.createChild("w1")).toThrowError(
        /child namespace "w1" already exists/,
      );
    });

    it("supports multi-level hierarchy", () => {
      const child = root.createChild("level1");
      const grandchild = child.createChild("level2");
      expect(grandchild.getParent()).toBe(child);
      expect(grandchild.getParent()?.getParent()).toBe(root);
    });
  });

  // ===========================================================================
  // Bubbling
  // ===========================================================================

  describe("Bubbling", () => {
    it("child emit bubbles to parent", () => {
      const parentHandler = vi.fn();
      root.on("step:start", parentHandler);
      const child = root.createChild("worker-1");
      child.emit("step:start", { step: 1 });

      // Parent should receive: 1 bubbled event
      expect(parentHandler).toHaveBeenCalledTimes(1);
      const evt = parentHandler.mock.calls[0][0] as AgentEvent;
      expect(evt.type).toBe("step:start");
      expect((evt.data as Record<string, unknown>)._source).toBe("worker-1");
      expect((evt.data as Record<string, unknown>)._bubbled).toBe(true);
    });

    it("grandchild emit bubbles through child to root", () => {
      const rootHandler = vi.fn();
      root.on("tool:call", rootHandler);
      const child = root.createChild("worker-1");
      const grandchild = child.createChild("sub-worker");
      grandchild.emit("tool:call", { tool: "search" });

      // Root should receive 1 event (bubbled from child)
      expect(rootHandler).toHaveBeenCalledTimes(1);
      const evt = rootHandler.mock.calls[0][0] as AgentEvent;
      expect((evt.data as Record<string, unknown>)._bubbled).toBe(true);
    });

    it("bubbled event does not trigger on the child again", () => {
      const childHandler = vi.fn();
      const child = root.createChild("w1");
      child.on("step:start", childHandler);
      child.emit("step:start");
      // Child handler should fire exactly once (direct emit), not from bubbling
      expect(childHandler).toHaveBeenCalledTimes(1);
    });

    it("wildcard on parent catches bubbled events", () => {
      const wildcardHandler = vi.fn();
      root.on("*", wildcardHandler);
      const child = root.createChild("w1");
      child.emit("agent:start");
      expect(wildcardHandler).toHaveBeenCalledTimes(1);
    });

    it("bubbled data wraps non-object data with _value", () => {
      const handler = vi.fn();
      root.on("step:start", handler);
      const child = root.createChild("w1");
      child.emit("step:start", 42);

      const data = handler.mock.calls[0][0].data as Record<string, unknown>;
      expect(data._value).toBe(42);
      expect(data._source).toBe("w1");
      expect(data._bubbled).toBe(true);
    });

    it("bubbled data wraps null data", () => {
      const handler = vi.fn();
      root.on("step:start", handler);
      const child = root.createChild("w1");
      child.emit("step:start", null);

      const data = handler.mock.calls[0][0].data as Record<string, unknown>;
      expect(data._value).toBeNull();
      expect(data._source).toBe("w1");
    });
  });

  // ===========================================================================
  // Capturing (broadcast)
  // ===========================================================================

  describe("Broadcast (Capturing)", () => {
    it("broadcast sends event to all children", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const c1 = root.createChild("w1");
      const c2 = root.createChild("w2");
      c1.on("agent:stop", h1);
      c2.on("agent:stop", h2);

      root.broadcast("agent:stop", { reason: "shutdown" });

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
      expect(h1.mock.calls[0][0].data).toEqual({ reason: "shutdown" });
    });

    it("broadcast is recursive to grandchildren", () => {
      const handler = vi.fn();
      const child = root.createChild("w1");
      const grandchild = child.createChild("sub");
      grandchild.on("agent:stop", handler);

      root.broadcast("agent:stop");

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("broadcast does not trigger on root itself", () => {
      const rootHandler = vi.fn();
      root.on("agent:stop", rootHandler);
      root.createChild("w1");
      root.broadcast("agent:stop");
      expect(rootHandler).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // onNamespaced
  // ===========================================================================

  describe("onNamespaced", () => {
    it("receives events only from the specified child namespace", () => {
      const nsHandler = vi.fn();
      const c1 = root.createChild("worker-1");
      root.createChild("worker-2");

      root.onNamespaced("worker-1", nsHandler);

      c1.emit("step:start", { step: 1 });

      expect(nsHandler).toHaveBeenCalledTimes(1);
      const evt = nsHandler.mock.calls[0][0] as AgentEvent;
      expect((evt.data as Record<string, unknown>)._source).toBe("worker-1");
    });

    it("does not receive events from other children", () => {
      const nsHandler = vi.fn();
      root.createChild("worker-1");
      const c2 = root.createChild("worker-2");

      root.onNamespaced("worker-1", nsHandler);
      c2.emit("step:start");

      expect(nsHandler).not.toHaveBeenCalled();
    });

    it("returns unsubscribe function", () => {
      const nsHandler = vi.fn();
      const child = root.createChild("w1");
      const unsub = root.onNamespaced("w1", nsHandler);
      unsub();
      child.emit("step:start");
      expect(nsHandler).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Anti-storm protection
  // ===========================================================================

  describe("Anti-storm Protection", () => {
    it("drops events after exceeding maxBubblesPerSecond", () => {
      const bus = new EventBus("s1", { maxBubblesPerSecond: 5 });
      const parentHandler = vi.fn();
      bus.on("step:start", parentHandler);
      const child = bus.createChild("stormy");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      for (let i = 0; i < 10; i++) {
        child.emit("step:start", { i });
      }

      // Parent should receive exactly 5 bubbled events
      expect(parentHandler).toHaveBeenCalledTimes(5);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/anti-storm/);

      warnSpy.mockRestore();
    });

    it("resets rate limit after 1 second window", async () => {
      const bus = new EventBus("s1", { maxBubblesPerSecond: 3 });
      const parentHandler = vi.fn();
      bus.on("step:start", parentHandler);
      const child = bus.createChild("w1");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Fill up the window
      for (let i = 0; i < 3; i++) child.emit("step:start");
      expect(parentHandler).toHaveBeenCalledTimes(3);

      // Wait for the window to reset
      await new Promise((r) => setTimeout(r, 1100));

      child.emit("step:start");
      expect(parentHandler).toHaveBeenCalledTimes(4);

      warnSpy.mockRestore();
    });

    it("default maxBubblesPerSecond is 100", () => {
      const bus = new EventBus("s1");
      const parentHandler = vi.fn();
      bus.on("step:start", parentHandler);
      const child = bus.createChild("w1");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      for (let i = 0; i < 105; i++) child.emit("step:start");

      expect(parentHandler).toHaveBeenCalledTimes(100);

      warnSpy.mockRestore();
    });
  });

  // ===========================================================================
  // New event types
  // ===========================================================================

  describe("New Event Types", () => {
    it("supports supervisor event types", () => {
      const handler = vi.fn();
      root.on("supervisor:start", handler);
      root.emit("supervisor:start", { supervisorId: "sup-1" });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("supports subagent event types", () => {
      const handler = vi.fn();
      root.on("subagent:start", handler);
      root.emit("subagent:start", { agentId: "sub-1" });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("supports graph:node:retry and graph:edge:traverse", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      root.on("graph:node:retry", h1);
      root.on("graph:edge:traverse", h2);
      root.emit("graph:node:retry");
      root.emit("graph:edge:traverse");
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });
});
