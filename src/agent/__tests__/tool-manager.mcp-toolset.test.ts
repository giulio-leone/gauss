import { describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "../../core/llm/index.js";

import { ToolManager } from "../tool-manager.js";
import { EventBus } from "../event-bus.js";
import { PluginManager } from "../../plugins/plugin-manager.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import { McpPolicyEngine } from "../../adapters/policy/mcp-policy-engine.js";
import type { McpPort } from "../../ports/mcp.port.js";
import type { RuntimePort } from "../../ports/runtime.port.js";

const mockModel = {
  modelId: "test-model",
  provider: "test",
} as unknown as LanguageModel;

const mockRuntime = {
  invokeModel: vi.fn(),
} as unknown as RuntimePort;

function createMockMcp(): McpPort {
  const mock = {
    discoverTools: vi.fn().mockResolvedValue({
      "docs:list": {
        name: "docs:list",
        description: "List docs",
        inputSchema: { type: "object", properties: {} },
      },
      "docs:read": {
        name: "docs:read",
        description: "Read docs",
        inputSchema: { type: "object", properties: {} },
      },
      "calc:add": {
        name: "calc:add",
        description: "Add numbers",
        inputSchema: { type: "object", properties: {} },
      },
    }),
    executeTool: vi.fn().mockResolvedValue({ ok: true }),
    isConnected: vi.fn().mockResolvedValue(true),
    healthCheck: vi.fn().mockResolvedValue(undefined),
  };
  return mock as unknown as McpPort;
}

describe("ToolManager MCP dynamic toolset", () => {
  it("includes all MCP tools by default", async () => {
    const manager = new ToolManager({
      model: mockModel,
      instructions: "test",
      maxSteps: 4,
      fs: new VirtualFilesystem(),
      memory: new InMemoryAdapter(),
      planning: false,
      subagents: false,
      mcp: createMockMcp(),
    }, new PluginManager());

    const tools = await manager.buildToolCatalog();
    const mcpTools = Object.keys(tools).filter((name) => name.startsWith("mcp:"));

    expect(mcpTools).toContain("mcp:docs:list");
    expect(mcpTools).toContain("mcp:docs:read");
    expect(mcpTools).toContain("mcp:calc:add");
  });

  it("filters MCP tools by includeServers", async () => {
    const manager = new ToolManager({
      model: mockModel,
      instructions: "test",
      maxSteps: 4,
      fs: new VirtualFilesystem(),
      memory: new InMemoryAdapter(),
      planning: false,
      subagents: false,
      mcp: createMockMcp(),
    }, new PluginManager());

    const tools = await manager.buildToolCatalog({
      mcpToolset: {
        includeServers: ["docs"],
      },
    });

    const mcpTools = Object.keys(tools).filter((name) => name.startsWith("mcp:"));

    expect(mcpTools).toContain("mcp:docs:list");
    expect(mcpTools).toContain("mcp:docs:read");
    expect(mcpTools).not.toContain("mcp:calc:add");
  });

  it("supports includeTools and excludeTools precedence", async () => {
    const manager = new ToolManager({
      model: mockModel,
      instructions: "test",
      maxSteps: 4,
      fs: new VirtualFilesystem(),
      memory: new InMemoryAdapter(),
      planning: false,
      subagents: false,
      mcp: createMockMcp(),
    }, new PluginManager());

    const tools = await manager.buildToolCatalog({
      mcpToolset: {
        includeTools: ["docs:list", "add"],
        excludeTools: ["docs:list"],
      },
    });

    const mcpTools = Object.keys(tools).filter((name) => name.startsWith("mcp:"));

    expect(mcpTools).not.toContain("mcp:docs:list");
    expect(mcpTools).toContain("mcp:calc:add");
    expect(mcpTools).not.toContain("mcp:docs:read");
  });

  it("enforces MCP policy deny rules and records audit", async () => {
    const policy = new McpPolicyEngine({
      rules: [
        {
          id: "deny-calc",
          effect: "deny",
          resourcePattern: "calc:*",
          reason: "No calculator tools",
          priority: 100,
        },
      ],
    });

    const manager = new ToolManager(
      {
        model: mockModel,
        instructions: "test",
        maxSteps: 4,
        fs: new VirtualFilesystem(),
        memory: new InMemoryAdapter(),
        planning: false,
        subagents: false,
        mcp: createMockMcp(),
        policyEngine: policy,
      },
      new PluginManager(),
    );

    const { tools } = await manager.prepareTools(
      "session-1",
      new EventBus(),
      mockRuntime,
      { policyContext: { tenantId: "acme" } },
    );

    await expect(tools["mcp:calc:add"]?.execute({})).rejects.toThrow(
      "MCP policy denied",
    );

    const audits = await policy.getAuditLog(1);
    expect(audits[0]?.request.resource).toBe("calc:add");
    expect(audits[0]?.context.tenantId).toBe("acme");
    expect(audits[0]?.decision.allowed).toBe(false);
  });

  it("registers policy management tools when policy engine is configured", async () => {
    const manager = new ToolManager(
      {
        model: mockModel,
        instructions: "test",
        maxSteps: 4,
        fs: new VirtualFilesystem(),
        memory: new InMemoryAdapter(),
        planning: false,
        subagents: false,
        policyEngine: new McpPolicyEngine(),
      },
      new PluginManager(),
    );

    const tools = await manager.buildToolCatalog();

    expect(Object.keys(tools)).toContain("policy_list_rules");
    expect(Object.keys(tools)).toContain("policy_add_rule");
    expect(Object.keys(tools)).toContain("policy_remove_rule");
    expect(Object.keys(tools)).toContain("policy_list_audit");
    expect(Object.keys(tools)).toContain("policy_clear_audit");
  });
});
