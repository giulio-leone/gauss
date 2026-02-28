import { describe, it, expect } from "vitest";
import {
  VisualAgentBuilder,
  ModelRegistry,
  AgentConfigSchema,
  type AgentConfigJSON,
} from "../visual-agent-builder.js";

const mockModel = { modelId: "test-model" } as any;

describe("ModelRegistry", () => {
  it("registers and retrieves models", () => {
    const reg = new ModelRegistry();
    reg.register("gpt-5.2", mockModel);
    expect(reg.has("gpt-5.2")).toBe(true);
    expect(reg.get("gpt-5.2")).toBe(mockModel);
    expect(reg.list()).toEqual(["gpt-5.2"]);
  });

  it("throws on unknown model", () => {
    const reg = new ModelRegistry();
    expect(() => reg.get("unknown")).toThrow('Model "unknown" not registered');
  });
});

describe("AgentConfigSchema", () => {
  it("validates a valid config", () => {
    const config = {
      id: "test",
      name: "Test Agent",
      nodes: [
        { id: "start", type: "agent", instructions: "Be helpful" },
      ],
      edges: [],
      entryNode: "start",
    };
    const result = AgentConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects invalid node type", () => {
    const config = {
      id: "test",
      name: "Test",
      nodes: [{ id: "n1", type: "invalid" }],
      edges: [],
      entryNode: "n1",
    };
    const result = AgentConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("VisualAgentBuilder", () => {
  const registry = new ModelRegistry().register("test-model", mockModel);

  const validConfig: AgentConfigJSON = {
    id: "pipeline",
    name: "Test Pipeline",
    version: "1.0.0",
    nodes: [
      { id: "input", type: "transform", instructions: "Preprocessing:" },
      { id: "agent1", type: "agent", instructions: "Analyze the text" },
      { id: "output", type: "transform" },
    ],
    edges: [
      { from: "input", to: "agent1" },
      { from: "agent1", to: "output" },
    ],
    entryNode: "input",
  };

  it("validates a correct config", () => {
    const builder = new VisualAgentBuilder(registry);
    const result = builder.validate(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing entry node", () => {
    const builder = new VisualAgentBuilder(registry);
    const result = builder.validate({
      ...validConfig,
      entryNode: "nonexistent",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("nonexistent");
  });

  it("detects broken edge references", () => {
    const builder = new VisualAgentBuilder(registry);
    const result = builder.validate({
      ...validConfig,
      edges: [{ from: "input", to: "ghost" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("ghost");
  });

  it("compiles and executes a transform-only pipeline", async () => {
    const builder = new VisualAgentBuilder(registry);
    const config: AgentConfigJSON = {
      id: "simple",
      name: "Simple",
      version: "1.0.0",
      nodes: [
        { id: "prefix", type: "transform", instructions: "HEADER:" },
      ],
      edges: [],
      entryNode: "prefix",
    };

    const agent = builder.compile(config);
    const result = await agent.execute("hello");
    expect(result.output).toBe("HEADER:\nhello");
    expect(result.nodesExecuted).toEqual(["prefix"]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("compiles a multi-node pipeline with edges", async () => {
    const builder = new VisualAgentBuilder(registry);
    const config: AgentConfigJSON = {
      id: "chain",
      name: "Chain",
      version: "1.0.0",
      nodes: [
        { id: "n1", type: "transform", instructions: "Step1:" },
        { id: "n2", type: "transform", instructions: "Step2:" },
      ],
      edges: [{ from: "n1", to: "n2" }],
      entryNode: "n1",
    };

    const agent = builder.compile(config);
    const result = await agent.execute("data");
    expect(result.nodesExecuted).toEqual(["n1", "n2"]);
    expect(result.output).toBe("Step2:\nStep1:\ndata");
  });

  it("handles tool node type", async () => {
    const builder = new VisualAgentBuilder(registry);
    const config: AgentConfigJSON = {
      id: "tool-test",
      name: "Tool Test",
      version: "1.0.0",
      nodes: [{ id: "t1", type: "tool" }],
      edges: [],
      entryNode: "t1",
    };

    const agent = builder.compile(config);
    const result = await agent.execute("input");
    expect(result.output).toBe("[tool:t1] input");
  });

  it("handles agent node without model", async () => {
    const builder = new VisualAgentBuilder(new ModelRegistry());
    const config: AgentConfigJSON = {
      id: "no-model",
      name: "No Model",
      version: "1.0.0",
      nodes: [{ id: "a1", type: "agent" }],
      edges: [],
      entryNode: "a1",
    };

    const agent = builder.compile(config);
    const result = await agent.execute("test");
    expect(result.output).toBe("[agent:a1] test");
  });

  it("exposes registry", () => {
    const builder = new VisualAgentBuilder(registry);
    expect(builder.getRegistry()).toBe(registry);
  });

  it("throws on invalid config in compile", () => {
    const builder = new VisualAgentBuilder(registry);
    expect(() =>
      builder.compile({ ...validConfig, entryNode: "ghost" })
    ).toThrow("Invalid config");
  });

  it("handles conditional edges", async () => {
    const builder = new VisualAgentBuilder(registry);
    const config: AgentConfigJSON = {
      id: "cond",
      name: "Conditional",
      version: "1.0.0",
      nodes: [
        { id: "router", type: "router" },
        { id: "yes", type: "transform", instructions: "YES" },
        { id: "no", type: "transform", instructions: "NO" },
      ],
      edges: [
        { from: "router", to: "yes", condition: 'output.includes("go")' },
        { from: "router", to: "no" },
      ],
      entryNode: "router",
    };

    const agent = builder.compile(config);

    const yesResult = await agent.execute("go ahead");
    expect(yesResult.nodesExecuted).toContain("yes");

    const noResult = await agent.execute("stop");
    expect(noResult.nodesExecuted).toContain("no");
  });
});
