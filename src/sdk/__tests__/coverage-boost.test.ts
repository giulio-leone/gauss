/**
 * Targeted coverage tests for dispose patterns, getters, and edge cases.
 * Covers: handle getters, Symbol.dispose, assertNotDisposed, resilience agent map.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("gauss-napi", () => ({
  // Provider
  create_provider: vi.fn(() => 100),
  destroy_provider: vi.fn(),
  version: vi.fn(() => "1.0.0"),
  agent_run: vi.fn(async () => ({ output: "ok", messages: [] })),
  agent_run_with_tool_executor: vi.fn(async () => ({ output: "ok", messages: [] })),
  agent_stream_with_tool_executor: vi.fn(async () => ({ output: "ok", messages: [] })),
  generate: vi.fn(async () => ({ text: "ok" })),
  generate_with_tools: vi.fn(async () => ({ text: "ok" })),

  // ToolValidator
  create_tool_validator: vi.fn(() => 200),
  validate_tool_call: vi.fn(() => true),
  destroy_tool_validator: vi.fn(),

  // MCP
  create_mcp_server: vi.fn(() => 300),
  mcp_server_add_tool: vi.fn(),
  mcp_server_handle: vi.fn(() => "ok"),
  destroy_mcp_server: vi.fn(),

  // Checkpoint
  create_checkpoint_store: vi.fn(() => 400),
  checkpoint_save: vi.fn(),
  checkpoint_load: vi.fn(() => ({ id: "cp1", data: {} })),
  checkpoint_load_latest: vi.fn(() => ({ id: "latest" })),
  destroy_checkpoint_store: vi.fn(),

  // Approval
  create_approval_manager: vi.fn(() => 500),
  approval_request: vi.fn(() => "req-1"),
  approval_approve: vi.fn(() => true),
  approval_deny: vi.fn(),
  approval_list_pending: vi.fn(() => []),
  destroy_approval_manager: vi.fn(),

  // Workflow
  create_workflow: vi.fn(() => 600),
  workflow_add_step: vi.fn(),
  workflow_add_dependency: vi.fn(),
  workflow_run: vi.fn(async () => ({ step1: "ok" })),
  destroy_workflow: vi.fn(),

  // Network
  create_network: vi.fn(() => 700),
  network_add_agent: vi.fn(),
  network_set_supervisor: vi.fn(),
  network_delegate: vi.fn(async () => ({ result: "ok" })),
  network_agent_cards: vi.fn(() => []),
  destroy_network: vi.fn(),

  // Plugin
  create_plugin_registry: vi.fn(() => 800),
  plugin_add_telemetry: vi.fn(),
  plugin_add_memory: vi.fn(),
  plugin_list: vi.fn(() => []),
  plugin_emit: vi.fn(),
  destroy_plugin_registry: vi.fn(),

  // Graph
  create_graph: vi.fn(() => 900),
  graph_add_node: vi.fn(),
  graph_add_edge: vi.fn(),
  graph_run: vi.fn(async () => ({ node1: "ok" })),
  destroy_graph: vi.fn(),

  // Telemetry
  create_telemetry: vi.fn(() => 1000),
  telemetry_record_span: vi.fn(),
  telemetry_export_spans: vi.fn(() => []),
  telemetry_export_metrics: vi.fn(() => []),
  telemetry_clear: vi.fn(),
  destroy_telemetry: vi.fn(),

  // Resilience
  create_fallback_provider: vi.fn(() => 1100),
  create_circuit_breaker: vi.fn(() => 1200),
  create_resilient_provider: vi.fn(() => 1300),

  // Guardrail
  create_guardrail_chain: vi.fn(() => 1400),
  guardrail_chain_add_content_moderation: vi.fn(),
  guardrail_chain_add_pii_detection: vi.fn(),
  guardrail_chain_add_token_limit: vi.fn(),
  guardrail_chain_add_regex_filter: vi.fn(),
  guardrail_chain_add_schema: vi.fn(),
  guardrail_chain_list: vi.fn(() => []),
  destroy_guardrail_chain: vi.fn(),

  // Eval
  create_eval_runner: vi.fn(() => 1500),
  eval_add_scorer: vi.fn(),
  eval_run: vi.fn(async () => ({ scores: [] })),
  destroy_eval_runner: vi.fn(),
}));

import { Agent } from "../agent.js";
import { ToolValidator } from "../tool-validator.js";
import { McpServer } from "../mcp.js";
import { CheckpointStore } from "../checkpoint.js";
import { ApprovalManager } from "../approval.js";
import { Workflow } from "../workflow.js";
import { Network } from "../network.js";
import { PluginRegistry } from "../plugin.js";
import { Graph } from "../graph.js";
import { Telemetry } from "../telemetry.js";
import { GuardrailChain } from "../guardrail.js";
import { EvalRunner } from "../eval.js";
import {
  createFallbackProvider,
  createCircuitBreaker,
  createResilientProvider,
  createResilientAgent,
} from "../resilience.js";

// ─── Handle Getter Tests ─────────────────────────────────────────

describe("handle getters", () => {
  it("ToolValidator.handle returns native handle", () => {
    const v = new ToolValidator([]);
    expect(v.handle).toBe(200);
    v.destroy();
  });

  it("McpServer.handle returns native handle", () => {
    const m = new McpServer("test", "1.0");
    expect(m.handle).toBe(300);
    m.destroy();
  });

  it("CheckpointStore.handle returns native handle", () => {
    const c = new CheckpointStore();
    expect(c.handle).toBe(400);
    c.destroy();
  });

  it("ApprovalManager.handle returns native handle", () => {
    const a = new ApprovalManager();
    expect(a.handle).toBe(500);
    a.destroy();
  });

  it("Workflow.handle returns native handle", () => {
    const w = new Workflow();
    expect(w.handle).toBe(600);
    w.destroy();
  });

  it("Network.handle returns native handle", () => {
    const n = new Network();
    expect(n.handle).toBe(700);
    n.destroy();
  });

  it("PluginRegistry.handle returns native handle", () => {
    const p = new PluginRegistry();
    expect(p.handle).toBe(800);
    p.destroy();
  });

  it("Graph.handle returns native handle", () => {
    const g = new Graph();
    expect(g.handle).toBe(900);
    g.destroy();
  });

  it("Telemetry.handle returns native handle", () => {
    const t = new Telemetry();
    expect(t.handle).toBe(1000);
    t.destroy();
  });

  it("GuardrailChain.handle returns native handle", () => {
    const g = new GuardrailChain();
    expect(g.handle).toBe(1400);
    g.destroy();
  });

  it("EvalRunner.handle returns native handle", () => {
    const e = new EvalRunner();
    expect(e.handle).toBe(1500);
    e.destroy();
  });
});

// ─── Symbol.dispose Tests ─────────────────────────────────────────

describe("Symbol.dispose", () => {
  it("ToolValidator supports Symbol.dispose", () => {
    const v = new ToolValidator([]);
    (v as any)[Symbol.dispose]();
    expect(() => v.validate({ name: "t", arguments: {} }, {})).toThrow();
  });

  it("McpServer supports Symbol.dispose", () => {
    const m = new McpServer("test", "1.0");
    (m as any)[Symbol.dispose]();
    expect(() => m.addTool({ name: "t", description: "d", parameters: {} })).toThrow();
  });

  it("CheckpointStore supports Symbol.dispose", async () => {
    const c = new CheckpointStore();
    (c as any)[Symbol.dispose]();
    await expect(c.load("id")).rejects.toThrow();
  });

  it("ApprovalManager supports Symbol.dispose", () => {
    const a = new ApprovalManager();
    (a as any)[Symbol.dispose]();
    expect(() => a.request("action", {}, "session-1")).toThrow();
  });

  it("Workflow supports Symbol.dispose", () => {
    const w = new Workflow();
    (w as any)[Symbol.dispose]();
    expect(() => w.addStep({ stepId: "s1", agent: { name: "a", handle: 0 } as any, instructions: "do" })).toThrow();
  });

  it("Network supports Symbol.dispose", () => {
    const n = new Network();
    (n as any)[Symbol.dispose]();
    expect(() => n.agentCards()).toThrow();
  });

  it("PluginRegistry supports Symbol.dispose", () => {
    const p = new PluginRegistry();
    (p as any)[Symbol.dispose]();
    expect(() => p.list()).toThrow();
  });

  it("Graph supports Symbol.dispose", () => {
    const g = new Graph();
    (g as any)[Symbol.dispose]();
    expect(() => g.addNode({ nodeId: "n1", agent: { name: "a", handle: 0 } as any, instructions: "do" })).toThrow();
  });

  it("Telemetry supports Symbol.dispose", () => {
    const t = new Telemetry();
    (t as any)[Symbol.dispose]();
    expect(() => t.exportSpans()).toThrow();
  });

  it("GuardrailChain supports Symbol.dispose", () => {
    const g = new GuardrailChain();
    (g as any)[Symbol.dispose]();
    expect(() => g.list()).toThrow();
  });

  it("EvalRunner supports Symbol.dispose", () => {
    const e = new EvalRunner();
    (e as any)[Symbol.dispose]();
    expect(() => e.addScorer("exact_match")).toThrow();
  });
});

// ─── assertNotDisposed Tests ──────────────────────────────────────

describe("assertNotDisposed throws after destroy", () => {
  it("ToolValidator throws after destroy", () => {
    const v = new ToolValidator([]);
    v.destroy();
    expect(() => v.validate({ name: "t", arguments: {} }, {})).toThrow(/disposed|destroyed/i);
  });

  it("McpServer throws after destroy", () => {
    const m = new McpServer("test", "1.0");
    m.destroy();
    expect(() => m.addTool({ name: "t", description: "d", parameters: {} })).toThrow(/disposed|destroyed/i);
  });

  it("CheckpointStore throws after destroy", async () => {
    const c = new CheckpointStore();
    c.destroy();
    await expect(c.save({ id: "x" })).rejects.toThrow(/destroyed/i);
  });

  it("ApprovalManager throws after destroy", () => {
    const a = new ApprovalManager();
    a.destroy();
    expect(() => a.request("action", {}, "session-1")).toThrow(/disposed|destroyed/i);
  });

  it("Workflow throws after destroy", () => {
    const w = new Workflow();
    w.destroy();
    expect(() => w.addStep({ stepId: "s1", agent: { name: "a", handle: 0 } as any, instructions: "do" })).toThrow(/disposed|destroyed/i);
  });

  it("Network throws after destroy", () => {
    const n = new Network();
    n.destroy();
    expect(() => n.agentCards()).toThrow(/disposed|destroyed/i);
  });

  it("PluginRegistry throws after destroy", () => {
    const p = new PluginRegistry();
    p.destroy();
    expect(() => p.list()).toThrow(/disposed|destroyed/i);
  });

  it("Graph throws after destroy", () => {
    const g = new Graph();
    g.destroy();
    expect(() => g.addNode({ nodeId: "n1", agent: { name: "a", handle: 0 } as any, instructions: "do" })).toThrow(/disposed|destroyed/i);
  });

  it("Telemetry throws after destroy", () => {
    const t = new Telemetry();
    t.destroy();
    expect(() => t.exportSpans()).toThrow(/destroyed/i);
  });

  it("GuardrailChain throws after destroy", () => {
    const g = new GuardrailChain();
    g.destroy();
    expect(() => g.list()).toThrow(/destroyed/i);
  });

  it("EvalRunner throws after destroy", () => {
    const e = new EvalRunner();
    e.destroy();
    expect(() => e.addScorer("exact_match")).toThrow(/disposed|destroyed/i);
  });
});

// ─── Resilience Tests ─────────────────────────────────────────────

describe("resilience module", () => {
  it("createFallbackProvider returns a handle", () => {
    const h = createFallbackProvider([100, 200]);
    expect(h).toBe(1100);
  });

  it("createCircuitBreaker returns a handle", () => {
    const h = createCircuitBreaker(100, 3, 5000);
    expect(h).toBe(1200);
  });

  it("createResilientProvider returns a handle", () => {
    const h = createResilientProvider(100, [200], true);
    expect(h).toBe(1300);
  });

  it("createResilientAgent maps agent handles and creates provider", () => {
    const primary = new Agent({ instructions: "primary" });
    const fallback1 = new Agent({ instructions: "fallback1" });
    const fallback2 = new Agent({ instructions: "fallback2" });

    const h = createResilientAgent(primary, [fallback1, fallback2], true);
    expect(h).toBe(1300);

    primary.destroy();
    fallback1.destroy();
    fallback2.destroy();
  });

  it("createResilientAgent defaults enableCircuitBreaker to true", () => {
    const primary = new Agent({ instructions: "p" });
    const fallback = new Agent({ instructions: "f" });

    const h = createResilientAgent(primary, [fallback]);
    expect(h).toBe(1300);

    primary.destroy();
    fallback.destroy();
  });
});

// ─── Agent Edge Cases ─────────────────────────────────────────────

describe("Agent edge cases", () => {
  it("Agent.handle returns provider handle", () => {
    const a = new Agent({ instructions: "test" });
    expect(a.handle).toBe(100);
    a.destroy();
  });

  it("Agent.providerHandle returns provider handle", () => {
    const a = new Agent({ instructions: "test" });
    expect((a as any).providerHandle).toBe(100);
    a.destroy();
  });

  it("Agent run with Message array input", async () => {
    const a = new Agent({ instructions: "test" });
    const result = await a.run([{ role: "user", content: "hello" }]);
    expect(result).toBeDefined();
    a.destroy();
  });

  it("Agent generate with string input", async () => {
    const a = new Agent({ instructions: "test" });
    const result = await a.generate("hello", { temperature: 0.5 });
    expect(result).toBeDefined();
    a.destroy();
  });

  it("Agent generate with Message array", async () => {
    const a = new Agent({ instructions: "test" });
    const result = await a.generate([{ role: "user", content: "hi" }]);
    expect(result).toBeDefined();
    a.destroy();
  });

  it("Agent generateWithTools", async () => {
    const a = new Agent({ instructions: "test" });
    const tools = [{ name: "search", description: "search", parameters: {} }];
    const result = await a.generateWithTools("find info", tools, { maxTokens: 100 });
    expect(result).toBeDefined();
    a.destroy();
  });

  it("Agent throws after dispose", async () => {
    const a = new Agent({ instructions: "test" });
    a.destroy();
    await expect(a.run("hello")).rejects.toThrow(/destroyed/i);
  });

  it("Agent Symbol.dispose works", async () => {
    const a = new Agent({ instructions: "test" });
    (a as any)[Symbol.dispose]();
    await expect(a.run("hello")).rejects.toThrow(/destroyed/i);
  });

  it("Agent double destroy is safe", () => {
    const a = new Agent({ instructions: "test" });
    a.destroy();
    expect(() => a.destroy()).not.toThrow();
  });

  it("Agent stream with Message array", async () => {
    const a = new Agent({ instructions: "test" });
    const events: unknown[] = [];
    const result = await a.stream(
      [{ role: "user", content: "hi" }],
      (e) => events.push(e),
      async () => "tool result"
    );
    expect(result).toBeDefined();
    a.destroy();
  });
});

// ─── Double Destroy Safety ─────────────────────────────────────────

describe("double destroy is safe", () => {
  it("ToolValidator", () => {
    const v = new ToolValidator([]);
    v.destroy();
    expect(() => v.destroy()).not.toThrow();
  });

  it("McpServer", () => {
    const m = new McpServer("test", "1.0");
    m.destroy();
    expect(() => m.destroy()).not.toThrow();
  });

  it("CheckpointStore", () => {
    const c = new CheckpointStore();
    c.destroy();
    expect(() => c.destroy()).not.toThrow();
  });

  it("Workflow", () => {
    const w = new Workflow();
    w.destroy();
    expect(() => w.destroy()).not.toThrow();
  });

  it("Network", () => {
    const n = new Network();
    n.destroy();
    expect(() => n.destroy()).not.toThrow();
  });

  it("PluginRegistry", () => {
    const p = new PluginRegistry();
    p.destroy();
    expect(() => p.destroy()).not.toThrow();
  });

  it("Graph", () => {
    const g = new Graph();
    g.destroy();
    expect(() => g.destroy()).not.toThrow();
  });

  it("Telemetry", () => {
    const t = new Telemetry();
    t.destroy();
    expect(() => t.destroy()).not.toThrow();
  });
});
