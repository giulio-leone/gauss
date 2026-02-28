// =============================================================================
// Graph Execution Tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { Agent } from "../agent.js";
import { graph } from "../graph.js";
import { createMockProvider } from "../../../testing/mock-provider.js";

function simpleAgent(text: string, name?: string) {
  return Agent({
    model: createMockProvider([{ text }]),
    name,
    description: `Agent that returns "${text}"`,
  });
}

describe("graph()", () => {
  describe("validation", () => {
    it("throws on missing edge source", () => {
      expect(() =>
        graph({
          nodes: { a: simpleAgent("A") },
          edges: [{ from: "missing", to: "a" }],
        }),
      ).toThrow('Edge source "missing" is not a registered node');
    });

    it("throws on missing edge target", () => {
      expect(() =>
        graph({
          nodes: { a: simpleAgent("A") },
          edges: [{ from: "a", to: "missing" }],
        }),
      ).toThrow('Edge target "missing" is not a registered node');
    });

    it("throws on cycles", () => {
      expect(() =>
        graph({
          nodes: {
            a: simpleAgent("A"),
            b: simpleAgent("B"),
          },
          edges: [
            { from: "a", to: "b" },
            { from: "b", to: "a" },
          ],
        }),
      ).toThrow("Graph contains a cycle");
    });
  });

  describe("linear pipeline", () => {
    it("executes A → B → C in order", async () => {
      const pipeline = graph({
        nodes: {
          a: simpleAgent("Result A"),
          b: simpleAgent("Result B"),
          c: simpleAgent("Result C"),
        },
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
        ],
      });

      const result = await pipeline.run("Start");

      expect(result.output).toBe("Result C");
      expect(result.nodeResults.size).toBe(3);
      expect(result.nodeResults.get("a")!.text).toBe("Result A");
      expect(result.nodeResults.get("b")!.text).toBe("Result B");
      expect(result.nodeResults.get("c")!.text).toBe("Result C");
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe("parallel branches", () => {
    it("executes independent nodes in parallel", async () => {
      // A and B have no deps (parallel), C depends on both
      const pipeline = graph({
        nodes: {
          a: simpleAgent("Result A"),
          b: simpleAgent("Result B"),
          c: simpleAgent("Result C"),
        },
        edges: [
          { from: "a", to: "c" },
          { from: "b", to: "c" },
        ],
      });

      const result = await pipeline.run("Start");

      expect(result.output).toBe("Result C"); // C is terminal
      expect(result.nodeResults.size).toBe(3);
    });
  });

  describe("diamond pattern", () => {
    it("handles A → [B, C] → D", async () => {
      const pipeline = graph({
        nodes: {
          a: simpleAgent("A out"),
          b: simpleAgent("B out"),
          c: simpleAgent("C out"),
          d: simpleAgent("D out"),
        },
        edges: [
          { from: "a", to: "b" },
          { from: "a", to: "c" },
          { from: "b", to: "d" },
          { from: "c", to: "d" },
        ],
      });

      const result = await pipeline.run("Input");

      expect(result.output).toBe("D out");
      expect(result.nodeResults.size).toBe(4);
    });
  });

  describe("single node", () => {
    it("runs a single node graph", async () => {
      const pipeline = graph({
        nodes: { only: simpleAgent("Only output") },
        edges: [],
      });

      const result = await pipeline.run("Input");
      expect(result.output).toBe("Only output");
    });
  });

  describe("multiple terminal nodes", () => {
    it("concatenates outputs from multiple terminals", async () => {
      const pipeline = graph({
        nodes: {
          a: simpleAgent("Source"),
          b: simpleAgent("Terminal B"),
          c: simpleAgent("Terminal C"),
        },
        edges: [
          { from: "a", to: "b" },
          { from: "a", to: "c" },
        ],
      });

      const result = await pipeline.run("Input");
      expect(result.output).toContain("Terminal B");
      expect(result.output).toContain("Terminal C");
    });
  });
});
