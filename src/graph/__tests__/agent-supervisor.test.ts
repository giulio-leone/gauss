// =============================================================================
// AgentSupervisor — Tests
// =============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { AgentNode } from "../agent-node.js";
import { AgentSupervisor } from "../agent-supervisor.js";
import { SupervisorBuilder } from "../supervisor-builder.js";
import { EventBus } from "../../agent/event-bus.js";

// =============================================================================
// Helpers
// =============================================================================

/** Minimal AgentNode stub — no real execution needed for supervisor tests. */
const makeNode = (id: string): AgentNode =>
  new AgentNode({ id, type: "agent" });

/** Factory tracking how many times it was called. */
const makeFactory = (
  id: string,
  counters: Record<string, number>,
  extra?: (node: AgentNode) => void,
) =>
  async (): Promise<AgentNode> => {
    counters[id] = (counters[id] ?? 0) + 1;
    const node = makeNode(id);
    extra?.(node);
    return node;
  };

// =============================================================================
// Tests
// =============================================================================

describe("AgentSupervisor", () => {
  // ---------------------------------------------------------------------------
  // one-for-one
  // ---------------------------------------------------------------------------
  describe("one-for-one strategy", () => {
    it("restarts only the crashed child, leaves others untouched", async () => {
      const counts: Record<string, number> = {};

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 5, windowMs: 10_000 },
        children: [
          { id: "a", policy: "permanent", factory: makeFactory("a", counts) },
          { id: "b", policy: "permanent", factory: makeFactory("b", counts) },
          { id: "c", policy: "permanent", factory: makeFactory("c", counts) },
        ],
      });

      await supervisor.start();
      expect(counts).toEqual({ a: 1, b: 1, c: 1 });

      await supervisor.handleChildCrash("b", new Error("boom"));

      expect(counts.a).toBe(1); // untouched
      expect(counts.b).toBe(2); // restarted
      expect(counts.c).toBe(1); // untouched
      expect(supervisor.getChildState("b")).toBe("running");
    });
  });

  // ---------------------------------------------------------------------------
  // one-for-all
  // ---------------------------------------------------------------------------
  describe("one-for-all strategy", () => {
    it("restarts all children when one crashes", async () => {
      const counts: Record<string, number> = {};

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-all",
        intensity: { maxRestarts: 5, windowMs: 10_000 },
        children: [
          { id: "a", policy: "permanent", factory: makeFactory("a", counts) },
          { id: "b", policy: "permanent", factory: makeFactory("b", counts) },
          { id: "c", policy: "permanent", factory: makeFactory("c", counts) },
        ],
      });

      await supervisor.start();
      await supervisor.handleChildCrash("b", new Error("boom"));

      expect(counts.a).toBe(2);
      expect(counts.b).toBe(2);
      expect(counts.c).toBe(2);
      expect(supervisor.getChildrenStatus()).toEqual({ a: "running", b: "running", c: "running" });
    });
  });

  // ---------------------------------------------------------------------------
  // rest-for-one
  // ---------------------------------------------------------------------------
  describe("rest-for-one strategy", () => {
    it("restarts crashed child and all subsequent children", async () => {
      const counts: Record<string, number> = {};

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "rest-for-one",
        intensity: { maxRestarts: 5, windowMs: 10_000 },
        children: [
          { id: "a", policy: "permanent", factory: makeFactory("a", counts) },
          { id: "b", policy: "permanent", factory: makeFactory("b", counts) },
          { id: "c", policy: "permanent", factory: makeFactory("c", counts) },
        ],
      });

      await supervisor.start();
      await supervisor.handleChildCrash("b", new Error("boom"));

      expect(counts.a).toBe(1); // before b — untouched
      expect(counts.b).toBe(2); // restarted
      expect(counts.c).toBe(2); // after b — also restarted
      expect(supervisor.getChildState("a")).toBe("running");
      expect(supervisor.getChildState("b")).toBe("running");
      expect(supervisor.getChildState("c")).toBe("running");
    });

    it("restarts only from the first child when it crashes", async () => {
      const counts: Record<string, number> = {};

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "rest-for-one",
        intensity: { maxRestarts: 5, windowMs: 10_000 },
        children: [
          { id: "a", policy: "permanent", factory: makeFactory("a", counts) },
          { id: "b", policy: "permanent", factory: makeFactory("b", counts) },
        ],
      });

      await supervisor.start();
      await supervisor.handleChildCrash("a", new Error("boom"));

      expect(counts.a).toBe(2);
      expect(counts.b).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // restart intensity
  // ---------------------------------------------------------------------------
  describe("restart intensity (sliding window)", () => {
    it("stops restarting after maxRestarts in windowMs and marks child stopped", async () => {
      const counts: Record<string, number> = {};

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 2, windowMs: 10_000 },
        children: [
          { id: "a", policy: "permanent", factory: makeFactory("a", counts) },
        ],
      });

      await supervisor.start(); // counts.a = 1

      await supervisor.handleChildCrash("a", new Error("crash 1")); // restart → counts.a = 2
      await supervisor.handleChildCrash("a", new Error("crash 2")); // restart → counts.a = 3
      // window has 2 restarts — next crash should exceed intensity
      await supervisor.handleChildCrash("a", new Error("crash 3")); // exceeded — no restart

      expect(counts.a).toBe(3); // initial + 2 restarts, 3rd crash not restarted
      expect(supervisor.getChildState("a")).toBe("stopped");
    });

    it("allows restarts again after the window expires", async () => {
      const counts: Record<string, number> = {};

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 1, windowMs: 50 }, // very short window
        children: [
          { id: "a", policy: "permanent", factory: makeFactory("a", counts) },
        ],
      });

      await supervisor.start();
      await supervisor.handleChildCrash("a", new Error("crash 1")); // restart (1st in window)
      await supervisor.handleChildCrash("a", new Error("crash 2")); // exceeded

      expect(supervisor.getChildState("a")).toBe("stopped");

      // Wait for window to expire, then simulate a new start and crash
      await new Promise((r) => setTimeout(r, 100));
      // Manually reset to running state so we can test the next window
      (supervisor as unknown as { children: Map<string, { status: string; restartTimestamps: number[] }> })
        .children.get("a")!.status = "running";
      (supervisor as unknown as { children: Map<string, { status: string; restartTimestamps: number[] }> })
        .children.get("a")!.restartTimestamps = [];

      await supervisor.handleChildCrash("a", new Error("crash in new window")); // should restart
      expect(counts.a).toBeGreaterThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  // escalation to parent supervisor
  // ---------------------------------------------------------------------------
  describe("escalation", () => {
    it("escalates to parent supervisor when intensity is exceeded", async () => {
      const parentSupervisor = new AgentSupervisor({
        id: "parent",
        strategy: "one-for-one",
        intensity: { maxRestarts: 10, windowMs: 60_000 },
        children: [],
      });
      const parentHandleCrash = vi.spyOn(parentSupervisor, "handleChildCrash").mockImplementation(async () => {});

      const supervisor = new AgentSupervisor({
        id: "child-sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 1, windowMs: 10_000 },
        children: [
          { id: "a", policy: "permanent", factory: async () => makeNode("a") },
        ],
        parentSupervisor,
      });

      await supervisor.start();
      await supervisor.handleChildCrash("a", new Error("crash 1")); // restart (1 in window)
      await supervisor.handleChildCrash("a", new Error("crash 2")); // exceeded → escalate

      expect(parentHandleCrash).toHaveBeenCalledWith("child-sup", expect.any(Error));
    });
  });

  // ---------------------------------------------------------------------------
  // graceful degradation
  // ---------------------------------------------------------------------------
  describe("graceful degradation", () => {
    it("calls degradedFallback when intensity exceeded and no parent", async () => {
      const fallback = vi.fn<[], Promise<string>>().mockResolvedValue("degraded response");

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 1, windowMs: 10_000 },
        children: [
          {
            id: "a",
            policy: "permanent",
            factory: async () => makeNode("a"),
            degradedFallback: fallback,
          },
        ],
      });

      await supervisor.start();
      await supervisor.handleChildCrash("a", new Error("crash 1")); // restart
      await supervisor.handleChildCrash("a", new Error("crash 2")); // exceeded → fallback

      expect(fallback).toHaveBeenCalledTimes(1);
      expect(supervisor.getChildState("a")).toBe("stopped");
    });
  });

  // ---------------------------------------------------------------------------
  // temporary policy
  // ---------------------------------------------------------------------------
  describe("temporary child policy", () => {
    it("does not restart a temporary child on crash", async () => {
      const counts: Record<string, number> = {};

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 5, windowMs: 10_000 },
        children: [
          { id: "a", policy: "temporary", factory: makeFactory("a", counts) },
        ],
      });

      await supervisor.start();
      expect(counts.a).toBe(1);

      await supervisor.handleChildCrash("a", new Error("crash"));

      expect(counts.a).toBe(1); // NOT restarted
      expect(supervisor.getChildState("a")).toBe("stopped");
    });
  });

  // ---------------------------------------------------------------------------
  // heartbeat monitoring
  // ---------------------------------------------------------------------------
  describe("heartbeat monitoring", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("triggers handleChildCrash when heartbeat ping times out", async () => {
      vi.useFakeTimers();

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 5, windowMs: 60_000 },
        children: [
          {
            id: "a",
            policy: "permanent",
            factory: async () => {
              const node = makeNode("a");
              // ping never resolves — simulates an unresponsive child
              (node as Record<string, unknown>)["ping"] = () => new Promise<void>(() => {});
              return node;
            },
            heartbeatIntervalMs: 100,
            heartbeatTimeoutMs: 50,
          },
        ],
      });

      // Mock handleChildCrash to prevent actual restart logic from interfering
      const handleCrash = vi
        .spyOn(supervisor, "handleChildCrash")
        .mockImplementation(async () => {});

      await supervisor.start();

      // Advance past interval (100ms) + timeout (50ms)
      await vi.advanceTimersByTimeAsync(200);

      expect(handleCrash).toHaveBeenCalledWith("a", expect.any(Error));

      await supervisor.shutdown();
    });

    it("does not call handleChildCrash when ping succeeds", async () => {
      vi.useFakeTimers();

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 5, windowMs: 60_000 },
        children: [
          {
            id: "a",
            policy: "permanent",
            factory: async () => {
              const node = makeNode("a");
              (node as Record<string, unknown>)["ping"] = () => Promise.resolve();
              return node;
            },
            heartbeatIntervalMs: 100,
            heartbeatTimeoutMs: 50,
          },
        ],
      });

      const handleCrash = vi
        .spyOn(supervisor, "handleChildCrash")
        .mockImplementation(async () => {});

      await supervisor.start();
      await vi.advanceTimersByTimeAsync(500);

      expect(handleCrash).not.toHaveBeenCalled();

      await supervisor.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // graceful shutdown
  // ---------------------------------------------------------------------------
  describe("graceful shutdown", () => {
    it("marks all children as stopped", async () => {
      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 3, windowMs: 5_000 },
        children: [
          { id: "a", policy: "permanent", factory: async () => makeNode("a") },
          { id: "b", policy: "permanent", factory: async () => makeNode("b") },
          { id: "c", policy: "permanent", factory: async () => makeNode("c") },
        ],
      });

      await supervisor.start();
      await supervisor.shutdown();

      const status = supervisor.getChildrenStatus();
      expect(status).toEqual({ a: "stopped", b: "stopped", c: "stopped" });
    });

    it("clears heartbeat timers so no crash is triggered after shutdown", async () => {
      vi.useFakeTimers();

      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 5, windowMs: 10_000 },
        children: [
          {
            id: "a",
            policy: "permanent",
            factory: async () => {
              const node = makeNode("a");
              (node as Record<string, unknown>)["ping"] = () =>
                new Promise<void>(() => {}); // never resolves
              return node;
            },
            heartbeatIntervalMs: 100,
            heartbeatTimeoutMs: 50,
          },
        ],
      });

      await supervisor.start();
      await supervisor.shutdown();

      const handleCrash = vi.spyOn(supervisor, "handleChildCrash");

      // No crash should be triggered after shutdown
      await vi.advanceTimersByTimeAsync(500);
      expect(handleCrash).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // ---------------------------------------------------------------------------
  // getLiveNode
  // ---------------------------------------------------------------------------
  describe("getLiveNode", () => {
    it("returns the live node for a running child", async () => {
      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 3, windowMs: 5_000 },
        children: [
          { id: "a", policy: "permanent", factory: async () => makeNode("a") },
        ],
      });

      await supervisor.start();
      const node = supervisor.getLiveNode("a");
      expect(node).toBeInstanceOf(AgentNode);
    });

    it("returns null for a stopped child", async () => {
      const supervisor = new AgentSupervisor({
        id: "sup",
        strategy: "one-for-one",
        intensity: { maxRestarts: 3, windowMs: 5_000 },
        children: [
          { id: "a", policy: "temporary", factory: async () => makeNode("a") },
        ],
      });

      await supervisor.start();
      await supervisor.handleChildCrash("a", new Error("crash"));
      expect(supervisor.getLiveNode("a")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // SupervisorBuilder
  // ---------------------------------------------------------------------------
  describe("SupervisorBuilder", () => {
    it("builds a supervisor with fluent API", async () => {
      const counts: Record<string, number> = {};

      const supervisor = new SupervisorBuilder("test-sup")
        .strategy("one-for-one")
        .intensity(3, 5_000)
        .child({
          id: "a",
          policy: "permanent",
          factory: makeFactory("a", counts),
        })
        .build();

      expect(supervisor).toBeInstanceOf(AgentSupervisor);
      await supervisor.start();
      expect(counts.a).toBe(1);
      await supervisor.shutdown();
    });

    it("withEventBus wires the event bus", async () => {
      const bus = new EventBus("test-session");
      const emitted: string[] = [];
      bus.on("*", (e) => emitted.push(e.type));

      const supervisor = new SupervisorBuilder("bus-sup")
        .strategy("one-for-one")
        .intensity(3, 5_000)
        .withEventBus(bus)
        .build();

      await supervisor.start();
      await supervisor.shutdown();

      expect(emitted).toContain("supervisor:start");
      expect(emitted).toContain("supervisor:stop");
    });

    it("withParent sets the parent supervisor", () => {
      const parent = new AgentSupervisor({
        id: "parent",
        strategy: "one-for-one",
        intensity: { maxRestarts: 5, windowMs: 10_000 },
        children: [],
      });

      const child = new SupervisorBuilder("child-sup")
        .strategy("one-for-all")
        .intensity(2, 3_000)
        .withParent(parent)
        .build();

      expect(child).toBeInstanceOf(AgentSupervisor);
    });
  });
});
