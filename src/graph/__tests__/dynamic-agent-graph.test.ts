import { describe, it, expect, vi } from "vitest";
import { DynamicAgentGraph } from "../dynamic-agent-graph.js";
import { EventBus } from "../../agent/event-bus.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nodeConfig = (id: string) => ({ id, type: "agent" as const });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DynamicAgentGraph", () => {
  describe("addNode", () => {
    it("adds a node successfully", () => {
      const g = new DynamicAgentGraph();
      const result = g.addNode(nodeConfig("a"), "actor1");
      expect(result.success).toBe(true);
      expect(g.getNodes().has("a")).toBe(true);
    });

    it("rejects duplicate node id", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      const result = g.addNode(nodeConfig("a"), "actor1");
      expect(result.success).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations![0].invariant).toBe("node-unique");
    });
  });

  describe("removeNode", () => {
    it("removes an existing node", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      const result = g.removeNode("a", "actor1");
      expect(result.success).toBe(true);
      expect(g.getNodes().has("a")).toBe(false);
    });

    it("rejects removal of non-existent node", () => {
      const g = new DynamicAgentGraph();
      const result = g.removeNode("ghost", "actor1");
      expect(result.success).toBe(false);
      expect(result.violations![0].invariant).toBe("node-exists");
    });

    it("rejects removal when other nodes depend on it", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      g.addEdge("a", "b", "actor1");
      const result = g.removeNode("a", "actor1");
      expect(result.success).toBe(false);
      expect(result.violations![0].invariant).toBe("no-dependents");
    });

    it("removes edges where the node is the target", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      g.addEdge("a", "b", "actor1");
      // Remove b (it depends on a, but nothing depends on b)
      const result = g.removeNode("b", "actor1");
      expect(result.success).toBe(true);
      expect(g.getEdges().has("b")).toBe(false);
    });
  });

  describe("replaceNode (hot-swap)", () => {
    it("replaces a node preserving edges", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      g.addEdge("a", "b", "actor1");

      const result = g.replaceNode("a", { id: "a", type: "agent" }, "actor1");
      expect(result.success).toBe(true);
      // Edges still intact
      expect(g.getEdges().get("b")).toContain("a");
    });

    it("rejects replace of non-existent node", () => {
      const g = new DynamicAgentGraph();
      const result = g.replaceNode("ghost", nodeConfig("ghost"), "actor1");
      expect(result.success).toBe(false);
      expect(result.violations![0].invariant).toBe("node-exists");
    });
  });

  describe("addEdge", () => {
    it("adds a valid edge", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      const result = g.addEdge("a", "b", "actor1");
      expect(result.success).toBe(true);
      expect(g.getEdges().get("b")).toContain("a");
    });

    it("rejects edge with non-existent source", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("b"), "actor1");
      const result = g.addEdge("ghost", "b", "actor1");
      expect(result.success).toBe(false);
      expect(result.violations!.some((v) => v.invariant === "node-exists")).toBe(true);
    });

    it("rejects edge with non-existent target", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      const result = g.addEdge("a", "ghost", "actor1");
      expect(result.success).toBe(false);
    });

    it("detects direct cycle (a→b, b→a)", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      g.addEdge("a", "b", "actor1");
      const result = g.addEdge("b", "a", "actor1");
      expect(result.success).toBe(false);
      expect(result.violations![0].invariant).toBe("no-cycle");
    });

    it("detects transitive cycle (a→b→c, c→a)", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      g.addNode(nodeConfig("c"), "actor1");
      g.addEdge("a", "b", "actor1");
      g.addEdge("b", "c", "actor1");
      const result = g.addEdge("c", "a", "actor1");
      expect(result.success).toBe(false);
      expect(result.violations![0].invariant).toBe("no-cycle");
    });
  });

  describe("removeEdge", () => {
    it("removes an existing edge", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      g.addEdge("a", "b", "actor1");
      const result = g.removeEdge("a", "b", "actor1");
      expect(result.success).toBe(true);
      expect(g.getEdges().has("b")).toBe(false);
    });

    it("rejects removal of non-existent edge", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      const result = g.removeEdge("a", "b", "actor1");
      expect(result.success).toBe(false);
      expect(result.violations![0].invariant).toBe("edge-exists");
    });
  });

  describe("mutation log", () => {
    it("appends every mutation (applied and rejected)", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("a"), "actor1"); // duplicate → rejected
      const log = g.getMutationLog();
      expect(log).toHaveLength(2);
      expect(log[0].status).toBe("applied");
      expect(log[1].status).toBe("rejected");
    });

    it("stores actorId in each entry", () => {
      const g = new DynamicAgentGraph();
      g.addNode(nodeConfig("a"), "alice");
      expect(g.getMutationLog()[0].actorId).toBe("alice");
    });

    it("stores rejection reason for rejected mutations", () => {
      const g = new DynamicAgentGraph();
      const result = g.removeNode("ghost", "actor1");
      const entry = g.getMutationLog()[0];
      expect(entry.status).toBe("rejected");
      expect(entry.rejectionReason).toBeTruthy();
      expect(result.mutationId).toBe(entry.id);
    });

    it("log is append-only (read-only reference)", () => {
      const g = new DynamicAgentGraph();
      const log = g.getMutationLog();
      g.addNode(nodeConfig("a"), "actor1");
      // The returned reference reflects new entries (it's a live view)
      expect(log).toHaveLength(1);
    });
  });

  describe("EventBus integration", () => {
    it("emits graph:mutation for every applied mutation", () => {
      const bus = new EventBus("test-session");
      const handler = vi.fn();
      bus.on("graph:mutation", handler);

      const g = new DynamicAgentGraph(bus);
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("b"), "actor1");
      g.addEdge("a", "b", "actor1");

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("emits graph:mutation for rejected mutations too", () => {
      const bus = new EventBus("test-session");
      const handler = vi.fn();
      bus.on("graph:mutation", handler);

      const g = new DynamicAgentGraph(bus);
      g.addNode(nodeConfig("a"), "actor1");
      g.addNode(nodeConfig("a"), "actor1"); // rejected

      expect(handler).toHaveBeenCalledTimes(2);
      const calls = handler.mock.calls.map((c) => c[0].data);
      expect(calls[0].status).toBe("applied");
      expect(calls[1].status).toBe("rejected");
    });

    it("event data contains mutationId matching log entry", () => {
      const bus = new EventBus("test-session");
      let capturedData: unknown;
      bus.on("graph:mutation", (e) => { capturedData = e.data; });

      const g = new DynamicAgentGraph(bus);
      const result = g.addNode(nodeConfig("x"), "actor1");

      expect((capturedData as { mutationId: string }).mutationId).toBe(result.mutationId);
    });
  });
});
