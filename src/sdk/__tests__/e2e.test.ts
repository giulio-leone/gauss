/**
 * E2E tests for Gauss SDK — full flow scenarios.
 *
 * Mocks gauss-napi so tests run without the native binary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("gauss-napi", () => ({
  create_provider: vi.fn(() => 42),
  destroy_provider: vi.fn(),
  agent_run: vi.fn(async () => ({
    text: "response",
    steps: 1,
    inputTokens: 10,
    outputTokens: 5,
  })),
  agent_run_with_tool_executor: vi.fn(async () => ({
    text: "response",
    steps: 1,
    inputTokens: 10,
    outputTokens: 5,
  })),
  create_memory: vi.fn(() => 99),
  memory_store: vi.fn(),
  memory_recall: vi.fn(async () => []),
  destroy_memory: vi.fn(),
  create_middleware_chain: vi.fn(() => 77),
  middleware_use_logging: vi.fn(),
  middleware_use_caching: vi.fn(),
  middleware_use_rate_limit: vi.fn(),
  destroy_middleware_chain: vi.fn(),
  create_guardrail_chain: vi.fn(() => 88),
  guardrail_chain_add_pii_detection: vi.fn(),
  guardrail_chain_add_content_moderation: vi.fn(),
  guardrail_chain_add_token_limit: vi.fn(),
  guardrail_chain_list: vi.fn(() => []),
  destroy_guardrail_chain: vi.fn(),
  create_team: vi.fn(() => 55),
  team_add_agent: vi.fn(),
  team_set_strategy: vi.fn(),
  team_run: vi.fn(async () => JSON.stringify({ text: "team result" })),
  destroy_team: vi.fn(),
  create_graph: vi.fn(() => 66),
  graph_add_node: vi.fn(),
  graph_add_edge: vi.fn(),
  graph_run: vi.fn(async () =>
    JSON.stringify({ node1: { text: "result" } }),
  ),
  destroy_graph: vi.fn(),
  estimate_cost: vi.fn(() => ({
    model: "gpt-4o",
    input_cost_usd: 0.001,
    output_cost_usd: 0.002,
    total_cost_usd: 0.003,
  })),
  create_network: vi.fn(() => 44),
  network_add_agent: vi.fn(),
  network_set_supervisor: vi.fn(),
  network_delegate: vi.fn(async () =>
    JSON.stringify({ text: "delegated" }),
  ),
  destroy_network: vi.fn(),
  count_tokens: vi.fn(() => 5),
  count_tokens_for_model: vi.fn(() => 5),
  get_context_window_size: vi.fn(() => 128000),
  get_provider_capabilities: vi.fn(() => ({})),
  generate: vi.fn(async () => ({})),
  generate_with_tools: vi.fn(async () => ({})),
}));

import { Agent } from "../agent.js";
import { tool } from "../tool.js";
import { Memory } from "../memory.js";
import { MiddlewareChain } from "../middleware.js";
import { GuardrailChain } from "../guardrail.js";
import { Team } from "../team.js";
import { Graph } from "../graph.js";
import { Network } from "../network.js";
import { estimateCost, countTokens, setPricing, getPricing, clearPricing } from "../tokens.js";
import { enterprisePreset } from "../enterprise.js";
import * as napi from "gauss-napi";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("E2E: basic agent", () => {
  it("creates an agent, runs a prompt, and destroys cleanly", async () => {
    const agent = new Agent({ name: "e2e-basic", provider: "openai", model: "gpt-4o" });
    const result = await agent.run("Hello");

    expect(result.text).toBe("response");
    expect(result.steps).toBe(1);
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(napi.create_provider).toHaveBeenCalled();
    expect(napi.agent_run).toHaveBeenCalled();

    agent.destroy();
    expect(napi.destroy_provider).toHaveBeenCalled();
  });
});

describe("E2E: typed tools", () => {
  it("registers a typed tool and runs with tool executor", async () => {
    const calculator = tool({
      name: "add",
      description: "Add two numbers",
      parameters: { a: { type: "number" }, b: { type: "number" } },
      execute: async (params: { a: number; b: number }) => params.a + params.b,
    });

    const agent = new Agent({ name: "e2e-tools", provider: "openai", model: "gpt-4o" });
    agent.addTool(calculator);

    const result = await agent.run("What is 2+3?");
    expect(result.text).toBe("response");
    expect(napi.agent_run_with_tool_executor).toHaveBeenCalled();

    agent.destroy();
  });
});

describe("E2E: middleware", () => {
  it("attaches a middleware chain with logging, caching, and rate limit", async () => {
    const mw = new MiddlewareChain();
    mw.useLogging().useCaching(60_000).useRateLimit(100);

    expect(napi.create_middleware_chain).toHaveBeenCalled();
    expect(napi.middleware_use_logging).toHaveBeenCalled();
    expect(napi.middleware_use_caching).toHaveBeenCalled();
    expect(napi.middleware_use_rate_limit).toHaveBeenCalled();

    const agent = new Agent({ name: "e2e-mw", provider: "openai", model: "gpt-4o" });
    agent.withMiddleware(mw);

    const result = await agent.run("test middleware");
    expect(result.text).toBe("response");

    agent.destroy();
    mw.destroy();
    expect(napi.destroy_middleware_chain).toHaveBeenCalled();
  });
});

describe("E2E: guardrails", () => {
  it("configures guardrails with PII, content moderation, and token limits", async () => {
    const gr = new GuardrailChain();
    gr.addPiiDetection("redact")
      .addContentModeration(["block-this"], ["warn-this"])
      .addTokenLimit(1000, 500);

    expect(napi.create_guardrail_chain).toHaveBeenCalled();
    expect(napi.guardrail_chain_add_pii_detection).toHaveBeenCalled();
    expect(napi.guardrail_chain_add_content_moderation).toHaveBeenCalled();
    expect(napi.guardrail_chain_add_token_limit).toHaveBeenCalled();

    const agent = new Agent({ name: "e2e-gr", provider: "openai", model: "gpt-4o" });
    agent.withGuardrails(gr);

    const result = await agent.run("test guardrails");
    expect(result.text).toBe("response");

    agent.destroy();
    gr.destroy();
    expect(napi.destroy_guardrail_chain).toHaveBeenCalled();
  });
});

describe("E2E: memory", () => {
  it("stores and recalls memory entries across agent runs", async () => {
    const mem = new Memory();
    mem.store({ id: "1", content: "Remember this", entryType: "conversation", timestamp: new Date().toISOString() });

    expect(napi.create_memory).toHaveBeenCalled();
    expect(napi.memory_store).toHaveBeenCalled();

    const recalled = await mem.recall();
    expect(napi.memory_recall).toHaveBeenCalled();
    expect(recalled).toEqual([]);

    const agent = new Agent({ name: "e2e-mem", provider: "openai", model: "gpt-4o" });
    agent.withMemory(mem, "session-1");

    const result = await agent.run("What did I say?");
    expect(result.text).toBe("response");

    agent.destroy();
    mem.destroy();
    expect(napi.destroy_memory).toHaveBeenCalled();
  });
});

describe("E2E: team", () => {
  it("creates a team of agents and runs a coordinated task", async () => {
    const writer = new Agent({ name: "writer", provider: "openai", model: "gpt-4o" });
    const reviewer = new Agent({ name: "reviewer", provider: "openai", model: "gpt-4o" });

    const team = new Team("content-team");
    team.add(writer, "Write content").add(reviewer, "Review content").strategy("sequential");

    expect(napi.create_team).toHaveBeenCalled();
    expect(napi.team_add_agent).toHaveBeenCalledTimes(2);
    expect(napi.team_set_strategy).toHaveBeenCalled();

    const result = await team.run("Write a blog post");
    expect(result).toBeDefined();

    team.destroy();
    writer.destroy();
    reviewer.destroy();
    expect(napi.destroy_team).toHaveBeenCalled();
  });
});

describe("E2E: graph", () => {
  it("builds a DAG with nodes and edges, then executes it", async () => {
    const agent1 = new Agent({ name: "node1", provider: "openai", model: "gpt-4o" });
    const agent2 = new Agent({ name: "node2", provider: "openai", model: "gpt-4o" });

    const graph = new Graph();
    graph.addNode({ nodeId: "node1", agent: agent1 }).addNode({ nodeId: "node2", agent: agent2 });
    graph.addEdge("node1", "node2");

    expect(napi.create_graph).toHaveBeenCalled();
    expect(napi.graph_add_node).toHaveBeenCalledTimes(2);
    expect(napi.graph_add_edge).toHaveBeenCalled();

    const result = await graph.run("Process this");
    expect(result).toBeDefined();

    graph.destroy();
    agent1.destroy();
    agent2.destroy();
    expect(napi.destroy_graph).toHaveBeenCalled();
  });
});

describe("E2E: cost tracking", () => {
  it("estimates cost and counts tokens for a model", () => {
    const cost = estimateCost("gpt-4o", { inputTokens: 100, outputTokens: 50 });
    expect(cost.model).toBe("gpt-4o");
    expect(cost.totalCostUsd).toBe(0.003);
    expect(napi.estimate_cost).toHaveBeenCalled();

    const tokens = countTokens("Hello world");
    expect(tokens).toBe(5);
    expect(napi.count_tokens).toHaveBeenCalledWith("Hello world");
  });
});

describe("E2E: enterprise preset", () => {
  it("creates an enterprise-configured agent with production defaults", async () => {
    const agent = enterprisePreset({ provider: "openai", model: "gpt-4o" });
    expect(agent).toBeInstanceOf(Agent);
    expect(napi.create_provider).toHaveBeenCalled();

    const result = await agent.run("Enterprise query");
    expect(result.text).toBe("response");

    agent.destroy();
  });
});

describe("E2E: pricing override", () => {
  it("sets custom pricing and retrieves it", () => {
    setPricing("custom-model", {
      inputPerToken: 0.00001,
      outputPerToken: 0.00002,
    });

    const pricing = getPricing("custom-model");
    expect(pricing).toBeDefined();
    expect(pricing!.inputPerToken).toBe(0.00001);
    expect(pricing!.outputPerToken).toBe(0.00002);

    clearPricing();
    expect(getPricing("custom-model")).toBeUndefined();
  });
});
