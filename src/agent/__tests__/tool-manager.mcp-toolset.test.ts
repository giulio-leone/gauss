import { describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";

import { ToolManager } from "../tool-manager.js";
import { PluginManager } from "../../plugins/plugin-manager.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import type { McpPort } from "../../ports/mcp.port.js";

const mockModel = {
  modelId: "test-model",
  provider: "test",
} as unknown as LanguageModel;

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
});
