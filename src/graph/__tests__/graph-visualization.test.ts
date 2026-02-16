import { describe, it, expect } from "vitest";
import type { LanguageModel } from "ai";
import type { DeepAgentConfig } from "../../types.js";
import { AgentGraph } from "../agent-graph.js";
import { AsciiGraphAdapter } from "../../adapters/graph-visualization/ascii-graph.adapter.js";
import { MermaidGraphAdapter } from "../../adapters/graph-visualization/mermaid-graph.adapter.js";
import type { GraphDescriptor } from "../../ports/graph-visualization.port.js";

const mockModel = { modelId: "test", provider: "test" } as unknown as LanguageModel;
const cfg = (instructions = "do stuff"): DeepAgentConfig =>
  ({ model: mockModel, instructions }) as DeepAgentConfig;

describe("Graph Visualization", () => {
  // ===========================================================================
  // Simple linear graph: A → B → C
  // ===========================================================================
  describe("linear graph (A → B → C)", () => {
    const graph = AgentGraph.create()
      .node("A", cfg())
      .node("B", cfg())
      .node("C", cfg())
      .edge("A", "B")
      .edge("B", "C")
      .build();

    it("describe() returns correct descriptor", () => {
      const desc = graph.describe();
      expect(desc.nodes).toHaveLength(3);
      expect(desc.edges).toEqual(
        expect.arrayContaining([
          { from: "A", to: "B" },
          { from: "B", to: "C" },
        ]),
      );
      expect(desc.forks).toHaveLength(0);
    });

    it("ASCII output contains all node ids", () => {
      const ascii = graph.visualize("ascii");
      expect(ascii).toContain("A");
      expect(ascii).toContain("B");
      expect(ascii).toContain("C");
      expect(ascii).toContain("──→");
    });

    it("Mermaid output contains edges", () => {
      const mermaid = graph.visualize("mermaid");
      expect(mermaid).toContain("graph LR");
      expect(mermaid).toContain("A --> B");
      expect(mermaid).toContain("B --> C");
    });
  });

  // ===========================================================================
  // Graph with fork
  // ===========================================================================
  describe("graph with fork", () => {
    const graph = AgentGraph.create()
      .node("start", cfg())
      .fork("reviewers", [cfg("reviewer 1"), cfg("reviewer 2")])
      .edge("start", "reviewers")
      .build();

    it("describe() includes fork info", () => {
      const desc = graph.describe();
      expect(desc.forks).toHaveLength(1);
      expect(desc.forks[0].id).toBe("reviewers");
      expect(desc.forks[0].nodeIds).toHaveLength(2);
    });

    it("ASCII output shows fork", () => {
      const ascii = graph.visualize("ascii");
      expect(ascii).toContain("start");
      expect(ascii).toContain("reviewers");
    });

    it("Mermaid output shows subgraph", () => {
      const mermaid = graph.visualize("mermaid");
      expect(mermaid).toContain("subgraph reviewers");
      expect(mermaid).toContain("end");
    });
  });

  // ===========================================================================
  // Graph with nested graph node
  // ===========================================================================
  describe("graph with nested graph node", () => {
    it("describe() marks nested node as graph type", () => {
      // Build a descriptor manually to test adapter behavior
      const descriptor: GraphDescriptor = {
        nodes: [
          { id: "entry", type: "agent" },
          { id: "sub", type: "graph" },
        ],
        edges: [{ from: "entry", to: "sub" }],
        forks: [],
      };

      const ascii = new AsciiGraphAdapter().toAscii(descriptor);
      expect(ascii).toContain("entry");
      expect(ascii).toContain("sub");
      expect(ascii).toContain("(graph)");

      const mermaid = new MermaidGraphAdapter().toMermaid(descriptor);
      expect(mermaid).toContain("sub[sub<br>graph]");
    });
  });

  // ===========================================================================
  // Empty graph (no nodes)
  // ===========================================================================
  describe("empty graph", () => {
    it("ASCII returns placeholder", () => {
      const ascii = new AsciiGraphAdapter().toAscii({ nodes: [], edges: [], forks: [] });
      expect(ascii).toBe("(empty graph)");
    });

    it("Mermaid returns header only", () => {
      const mermaid = new MermaidGraphAdapter().toMermaid({ nodes: [], edges: [], forks: [] });
      expect(mermaid).toBe("graph LR");
    });
  });

  // ===========================================================================
  // Getters
  // ===========================================================================
  describe("getters", () => {
    const graph = AgentGraph.create()
      .node("x", cfg())
      .node("y", cfg())
      .edge("x", "y")
      .build();

    it("getNodes() returns all nodes", () => {
      const nodes = graph.getNodes();
      expect(nodes.size).toBe(2);
      expect(nodes.get("x")?.id).toBe("x");
    });

    it("getEdges() returns edge map", () => {
      const edges = graph.getEdges();
      expect(edges.get("y")).toEqual(["x"]);
    });

    it("getForks() returns fork map", () => {
      expect(graph.getForks().size).toBe(0);
    });
  });

  // ===========================================================================
  // Default format
  // ===========================================================================
  it("visualize() defaults to ascii", () => {
    const graph = AgentGraph.create().node("solo", cfg()).build();
    const result = graph.visualize();
    expect(result).toContain("solo");
    expect(result).toContain("┌");
  });
});
