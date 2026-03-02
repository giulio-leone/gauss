/**
 * Tests for M35 (Agent Integration Glue) and M36 (Typed Tool System).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock NAPI before imports
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
    text: "tool response",
    steps: 2,
    inputTokens: 15,
    outputTokens: 8,
  })),
  agent_stream_with_tool_executor: vi.fn(async () => ({
    text: "streamed",
    steps: 1,
    inputTokens: 10,
    outputTokens: 5,
  })),
  generate: vi.fn(async () => ({})),
  generate_with_tools: vi.fn(async () => ({})),
  get_provider_capabilities: vi.fn(() => ({})),
  create_memory: vi.fn(() => 99),
  memory_store: vi.fn(async () => {}),
  memory_recall: vi.fn(async () => []),
  memory_clear: vi.fn(async () => {}),
  memory_stats: vi.fn(async () => ({})),
  destroy_memory: vi.fn(),
  create_middleware_chain: vi.fn(() => 77),
  middleware_use_logging: vi.fn(),
  middleware_use_caching: vi.fn(),
  middleware_use_rate_limit: vi.fn(),
  destroy_middleware_chain: vi.fn(),
  create_guardrail_chain: vi.fn(() => 88),
  guardrail_chain_add_content_moderation: vi.fn(),
  guardrail_chain_add_pii_detection: vi.fn(),
  guardrail_chain_add_token_limit: vi.fn(),
  guardrail_chain_add_regex_filter: vi.fn(),
  guardrail_chain_add_schema: vi.fn(),
  guardrail_chain_list: vi.fn(() => []),
  destroy_guardrail_chain: vi.fn(),
}));

import { Agent } from "../agent.js";
import { Memory } from "../memory.js";
import { MiddlewareChain } from "../middleware.js";
import { GuardrailChain } from "../guardrail.js";
import { tool, isTypedTool, createToolExecutor, type TypedToolDef } from "../tool.js";
import {
  agent_run,
  agent_run_with_tool_executor,
  memory_store,
  memory_recall,
} from "gauss-napi";

// ─── M36: Typed Tool System ─────────────────────────────────────────

describe("tool() helper", () => {
  it("creates a TypedToolDef with all fields", () => {
    const t = tool({
      name: "search",
      description: "Search the web",
      parameters: { query: { type: "string" } },
      execute: async ({ query }: { query: string }) => ({ results: [query] }),
    });

    expect(t.name).toBe("search");
    expect(t.description).toBe("Search the web");
    expect(t.parameters).toEqual({ query: { type: "string" } });
    expect(typeof t.execute).toBe("function");
  });

  it("isTypedTool detects typed vs raw tools", () => {
    const typed = tool({
      name: "t1",
      description: "test",
      execute: () => "ok",
    });
    const raw = { name: "t2", description: "test" };

    expect(isTypedTool(typed)).toBe(true);
    expect(isTypedTool(raw)).toBe(false);
  });
});

describe("createToolExecutor", () => {
  it("dispatches tool calls to the correct execute callback", async () => {
    const adder = tool({
      name: "add",
      description: "Add numbers",
      execute: async ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
    });

    const executor = createToolExecutor([adder]);

    const result = await executor(JSON.stringify({ tool: "add", args: { a: 2, b: 3 } }));
    expect(JSON.parse(result)).toEqual({ sum: 5 });
  });

  it("returns error for unknown tool", async () => {
    const executor = createToolExecutor([]);
    const result = await executor(JSON.stringify({ tool: "unknown", args: {} }));
    expect(JSON.parse(result)).toEqual({ error: "Unknown tool: unknown" });
  });

  it("catches execute errors", async () => {
    const failing = tool({
      name: "fail",
      description: "Always fails",
      execute: () => { throw new Error("boom"); },
    });

    const executor = createToolExecutor([failing]);
    const result = await executor(JSON.stringify({ tool: "fail", args: {} }));
    expect(JSON.parse(result)).toEqual({ error: "boom" });
  });

  it("uses fallback for unmatched tools", async () => {
    const t1 = tool({ name: "t1", description: "Test", execute: () => "ok" });
    const fallback = vi.fn(async () => '{"custom":"fallback"}');

    const executor = createToolExecutor([t1], fallback);
    const result = await executor(JSON.stringify({ tool: "other", args: {} }));
    expect(result).toBe('{"custom":"fallback"}');
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("handles string return from execute", async () => {
    const t = tool({
      name: "echo",
      description: "Echo",
      execute: ({ msg }: { msg: string }) => msg,
    });

    const executor = createToolExecutor([t]);
    const result = await executor(JSON.stringify({ tool: "echo", args: { msg: "hello" } }));
    expect(result).toBe("hello");
  });
});

// ─── M35: Agent Integration Glue ────────────────────────────────────

describe("Agent.withMiddleware", () => {
  it("stores middleware reference and returns this", () => {
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const chain = new MiddlewareChain().useLogging();

    const result = agent.withMiddleware(chain);

    expect(result).toBe(agent); // chainable
    agent.destroy();
    chain.destroy();
  });
});

describe("Agent.withGuardrails", () => {
  it("stores guardrails reference and returns this", () => {
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const chain = new GuardrailChain().addPiiDetection("warn");

    const result = agent.withGuardrails(chain);

    expect(result).toBe(agent); // chainable
    agent.destroy();
    chain.destroy();
  });
});

describe("Agent.withMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(memory_recall).mockResolvedValue([]);
  });

  it("stores memory reference and returns this", () => {
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const memory = new Memory();

    const result = agent.withMemory(memory, "session-1");

    expect(result).toBe(agent); // chainable
    agent.destroy();
    memory.destroy();
  });

  it("recalls memory before run and stores after", async () => {
    vi.mocked(memory_recall).mockResolvedValue([
      { id: "1", content: "previous message", entryType: "conversation", timestamp: "2024-01-01" },
    ]);

    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const memory = new Memory();
    agent.withMemory(memory, "test-session");

    await agent.run("Hello!");

    // Should have recalled memory
    expect(memory_recall).toHaveBeenCalled();

    // Should have stored user + assistant messages
    expect(memory_store).toHaveBeenCalledTimes(2);

    agent.destroy();
    memory.destroy();
  });

  it("injects recalled context as system message", async () => {
    vi.mocked(memory_recall).mockResolvedValue([
      { id: "1", content: "I like cats", entryType: "fact", timestamp: "2024-01-01" },
    ]);

    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const memory = new Memory();
    agent.withMemory(memory);

    await agent.run("What do I like?");

    // The run should include a system message with context
    const runCall = vi.mocked(agent_run).mock.calls[0];
    const messages = runCall?.[3] ?? [];
    expect(messages[0]).toEqual({
      role: "system",
      content: expect.stringContaining("I like cats"),
    });

    agent.destroy();
    memory.destroy();
  });
});

describe("Agent with typed tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-creates tool executor for typed tools", async () => {
    const calc = tool({
      name: "calc",
      description: "Calculator",
      parameters: { expr: { type: "string" } },
      execute: async () => ({ result: 42 }),
    });

    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    agent.addTool(calc);

    await agent.run("Calculate 6*7");

    // Should use agent_run_with_tool_executor (not agent_run)
    expect(agent_run_with_tool_executor).toHaveBeenCalled();
    expect(agent_run).not.toHaveBeenCalled();

    agent.destroy();
  });

  it("strips execute callbacks from tool defs sent to NAPI", async () => {
    const t = tool({
      name: "test",
      description: "Test tool",
      parameters: { x: { type: "number" } },
      execute: () => "ok",
    });

    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    agent.addTool(t);

    await agent.run("test");

    const toolDefs = vi.mocked(agent_run_with_tool_executor).mock.calls[0]?.[2];
    expect(toolDefs).toEqual([
      { name: "test", description: "Test tool", parameters: { x: { type: "number" } } },
    ]);
    // No execute property sent to NAPI
    expect(toolDefs?.[0]).not.toHaveProperty("execute");

    agent.destroy();
  });

  it("mixes raw and typed tools", async () => {
    const rawTool = { name: "raw", description: "Raw tool" };
    const typedTool = tool({
      name: "typed",
      description: "Typed tool",
      execute: () => "ok",
    });

    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    agent.addTools([rawTool, typedTool]);

    await agent.run("test");

    // Should use executor because at least one typed tool exists
    expect(agent_run_with_tool_executor).toHaveBeenCalled();

    const toolDefs = vi.mocked(agent_run_with_tool_executor).mock.calls[0]?.[2];
    expect(toolDefs).toHaveLength(2);
    expect(toolDefs?.[0].name).toBe("raw");
    expect(toolDefs?.[1].name).toBe("typed");

    agent.destroy();
  });
});

describe("Agent config integration", () => {
  it("accepts middleware/guardrails/memory in config", () => {
    const middleware = new MiddlewareChain().useLogging();
    const guardrails = new GuardrailChain();
    const memory = new Memory();

    const agent = new Agent({
      providerOptions: { apiKey: "k" },
      middleware,
      guardrails,
      memory,
      sessionId: "s1",
    });

    // Should not throw — all wired up
    expect(agent.name).toBe("agent");

    agent.destroy();
    middleware.destroy();
    guardrails.destroy();
    memory.destroy();
  });
});
