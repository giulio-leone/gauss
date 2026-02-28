import { describe, it, expect } from "vitest";
import type { LanguageModel } from "../../core/llm/index.js";
import type { AgentConfig } from "../../types.js";

import { AgentGraph, AgentGraphBuilder } from "../agent-graph.js";

// =============================================================================
// Helpers
// =============================================================================

const mockModel = { modelId: "test", provider: "test" } as unknown as LanguageModel;

const cfg = (instructions = "do stuff"): AgentConfig =>
  ({ model: mockModel, instructions }) as AgentConfig;

// =============================================================================
// Tests
// =============================================================================

describe("AgentGraph / AgentGraphBuilder", () => {
  it("node() adds a node", () => {
    const builder = AgentGraph.create();
    const result = builder.node("a", cfg());
    expect(result).toBe(builder); // returns this
  });

  it("edge() creates a dependency", () => {
    const graph = AgentGraph.create()
      .node("a", cfg())
      .node("b", cfg())
      .edge("a", "b")
      .build();

    expect(graph).toBeInstanceOf(AgentGraph);
  });

  it("fork() with < 2 configs throws", () => {
    expect(() =>
      AgentGraph.create().fork("f", [cfg()]),
    ).toThrow("at least 2 configs");
  });

  it("duplicate node id throws", () => {
    expect(() =>
      AgentGraph.create().node("a", cfg()).node("a", cfg()),
    ).toThrow('"a" already exists');
  });

  it("cycle detection throws", () => {
    expect(() =>
      AgentGraph.create()
        .node("a", cfg())
        .node("b", cfg())
        .edge("a", "b")
        .edge("b", "a")
        .build(),
    ).toThrow("Cycle detected");
  });

  it("invalid edge reference throws", () => {
    expect(() =>
      AgentGraph.create()
        .node("a", cfg())
        .edge("a", "missing")
        .build(),
    ).toThrow('does not exist');
  });

  it("build() succeeds with valid DAG", () => {
    const graph = AgentGraph.create()
      .node("a", cfg())
      .node("b", cfg())
      .node("c", cfg())
      .edge("a", "b")
      .edge("b", "c")
      .build();

    expect(graph).toBeInstanceOf(AgentGraph);
  });
});
