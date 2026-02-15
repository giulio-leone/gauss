import { describe, expect, it, beforeEach } from "vitest";
import { AgentGraph, AgentGraphBuilder } from "../../graph/agent-graph.js";
import { SharedContext } from "../../graph/shared-context.js";
import { MajorityVoteConsensus } from "../../adapters/consensus/majority-vote.adapter.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import { DeepAgent } from "../../agent/deep-agent.js";
import type { LanguageModel } from "ai";

// Mock language model for testing
const mockLanguageModel: LanguageModel = {
  modelId: "test-model",
  generateContent: async () => ({
    text: "Test response",
    finishReason: "completed",
  }),
} as any;

describe("Graph Execution Integration", () => {
  let filesystem: VirtualFilesystem;

  beforeEach(() => {
    filesystem = new VirtualFilesystem();
  });

  describe("AgentGraphBuilder", () => {
    it("should build a graph with registered nodes", () => {
      const builder = AgentGraph.create({
        maxConcurrency: 2,
        timeout: 5000,
      });

      const agent1 = new DeepAgent({
        name: "agent1",
        instructions: "Test agent 1",
        model: mockLanguageModel,
      });

      const agent2 = new DeepAgent({
        name: "agent2", 
        instructions: "Test agent 2",
        model: mockLanguageModel,
      });

      builder
        .node("node1", {
          name: "agent1",
          instructions: "Test agent 1",
          model: mockLanguageModel,
        })
        .node("node2", {
          name: "agent2",
          instructions: "Test agent 2",
          model: mockLanguageModel,
        })
        .edge("node1", "node2");

      const graph = builder.build();

      expect(graph).toBeInstanceOf(AgentGraph);
    });

    it("should handle fork configurations with consensus", () => {
      const consensus = new MajorityVoteConsensus();
      
      const builder = AgentGraph.create();
      
      const agent1 = new DeepAgent({
        name: "agent1",
        instructions: "Test agent 1",
        model: mockLanguageModel,
      });

      const agent2 = new DeepAgent({
        name: "agent2",
        instructions: "Test agent 2", 
        model: mockLanguageModel,
      });

      const agent3 = new DeepAgent({
        name: "agent3",
        instructions: "Test agent 3",
        model: mockLanguageModel,
      });

      builder
        .node("node1", {
          name: "agent1",
          instructions: "Test agent 1",
          model: mockLanguageModel,
        })
        .fork("fork1", [
          {
            name: "agent2",
            instructions: "Test agent 2",
            model: mockLanguageModel,
          },
          {
            name: "agent3",
            instructions: "Test agent 3",
            model: mockLanguageModel,
          },
        ])
        .consensus("fork1", consensus);

      const graph = builder.build();
      expect(graph).toBeInstanceOf(AgentGraph);
    });

    it("should validate graph configuration properly", () => {
      const builder = AgentGraph.create({
        maxConcurrency: 1, // Valid configuration
      });

      builder.node("node1", {
        name: "agent",
        instructions: "Test agent", 
        model: mockLanguageModel,
      });

      // Should build successfully with valid configuration
      const graph = builder.build();
      expect(graph).toBeInstanceOf(AgentGraph);
    });
  });

  describe("SharedContext", () => {
    let sharedContext: SharedContext;

    beforeEach(() => {
      sharedContext = new SharedContext(filesystem);
    });

    it("should set and get values", async () => {
      await sharedContext.set("key1", "value1");
      await sharedContext.set("key2", { nested: "object" });

      expect(await sharedContext.get("key1")).toBe("value1");
      expect(await sharedContext.get("key2")).toEqual({ nested: "object" });
      expect(await sharedContext.get("nonexistent")).toBeNull();
    });

    it("should provide all data", async () => {
      await sharedContext.set("a", 1);
      await sharedContext.set("b", 2);
      await sharedContext.set("c", "three");

      const keys = await sharedContext.list();
      expect(keys.length).toBe(3);
      expect(keys).toContain("a");
      expect(keys).toContain("b");
      expect(keys).toContain("c");
    });

    it("should handle different contexts correctly", async () => {
      const context1 = new SharedContext(filesystem, "/.shared1");
      const context2 = new SharedContext(filesystem, "/.shared2");

      await context1.set("shared", "original");
      await context1.set("unique1", "value1");

      await context2.set("shared", "updated");
      await context2.set("unique2", "value2");

      // Different namespaces should maintain separate values
      expect(await context1.get("shared")).toBe("original");
      expect(await context1.get("unique1")).toBe("value1");
      expect(await context2.get("shared")).toBe("updated");
      expect(await context2.get("unique2")).toBe("value2");
      expect(await context1.get("unique2")).toBeNull();
      expect(await context2.get("unique1")).toBeNull();
    });

    it("should handle complex data structures", async () => {
      const complexData = {
        array: [1, 2, 3],
        nested: {
          deep: {
            value: "test"
          }
        },
        timestamp: 1704067200000, // Use timestamp instead of Date object
      };

      await sharedContext.set("complex", complexData);
      const retrieved = await sharedContext.get("complex");

      expect(retrieved).toEqual(complexData);
    });

    it("should provide delete method", async () => {
      await sharedContext.set("exists", "value");
      expect(await sharedContext.get("exists")).toBe("value");
      
      await sharedContext.delete("exists");
      expect(await sharedContext.get("exists")).toBeNull();
    });
  });

  describe("MajorityVoteConsensus", () => {
    let consensus: MajorityVoteConsensus;

    beforeEach(() => {
      consensus = new MajorityVoteConsensus();
    });

    it("should handle simple majority voting", async () => {
      const results = [
        { id: "node1", output: "A" },
        { id: "node2", output: "A" },
        { id: "node3", output: "B" },
      ];

      const winner = await consensus.evaluate(results);
      expect(winner.winnerOutput).toBe("A");
      expect(winner.winnerId).toBe("node1");
    });

    it("should handle tie scenarios", async () => {
      const results = [
        { id: "node1", output: "A" },
        { id: "node2", output: "B" },
      ];

      const winner = await consensus.evaluate(results);
      // Should return first result in case of tie
      expect(winner.winnerOutput).toBe("A");
    });

    it("should handle single result", async () => {
      const results = [
        { id: "node1", output: "only" },
      ];

      const winner = await consensus.evaluate(results);
      expect(winner.winnerOutput).toBe("only");
    });

    it("should handle complex object results", async () => {
      const complexResult = JSON.stringify({ text: "answer", score: 0.9 });
      const results = [
        { id: "node1", output: complexResult },
        { id: "node2", output: complexResult },
        { id: "node3", output: JSON.stringify({ text: "different", score: 0.1 }) },
      ];

      const winner = await consensus.evaluate(results);
      expect(winner.winnerOutput).toEqual(complexResult);
    });

    it("should handle empty results array", async () => {
      const results: Array<{ id: string; output: string }> = [];

      await expect(consensus.evaluate(results)).rejects.toThrow();
    });

    it("should serialize results for comparison", async () => {
      const obj1 = JSON.stringify({ a: 1, b: 2 });
      const obj2 = JSON.stringify({ b: 2, a: 1 }); // Different string representation
      const results = [
        { id: "node1", output: obj1 },
        { id: "node2", output: obj1 }, // Same
        { id: "node3", output: obj2 }, // Different string
      ];

      const winner = await consensus.evaluate(results);
      // Should treat strings exactly
      expect(winner.winnerOutput).toBe(obj1);
    });
  });

  describe("Graph execution flow", () => {
    it("should pass context between nodes", async () => {
      const sharedContext = new SharedContext(filesystem);
      
      // Simulate node execution
      await sharedContext.set("step1_output", "processed_data");
      await sharedContext.set("step1_metadata", { timestamp: Date.now() });

      // Simulate next node accessing context
      expect(await sharedContext.get("step1_output")).toBe("processed_data");
      expect(await sharedContext.get("step1_metadata")).toBeTruthy();

      // Simulate context from parallel nodes
      await sharedContext.set("parallel_result", "concurrent_data");
      expect(await sharedContext.get("parallel_result")).toBe("concurrent_data");
    });
  });
});