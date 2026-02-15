import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import type { PluginSetupContext } from "../../ports/plugin.port.js";
import { DefaultMcpServerAdapter } from "../../adapters/mcp-server/default-mcp-server.adapter.js";
import type { McpToolServerDefinition } from "../../ports/mcp-server.port.js";
import { McpServerPlugin } from "../mcp-server.plugin.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function createSetupContext(toolNames: string[] = ["read_file", "write_file"]): PluginSetupContext {
  return {
    sessionId: "session-mcp-server",
    agentName: "MCP Server Agent",
    config: {
      instructions: "Test instructions",
      maxSteps: 10,
    },
    filesystem: new VirtualFilesystem(),
    memory: new InMemoryAdapter(),
    toolNames,
    on: () => () => {},
  };
}

const SAMPLE_TOOLS: McpToolServerDefinition[] = [
  {
    name: "read_file",
    description: "Read a file from disk",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to file" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
];

const mockExecutor = vi.fn(async (name: string, _args: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: `Executed: ${name}` }],
}));

// ── DefaultMcpServerAdapter tests ─────────────────────────────────────────

describe("DefaultMcpServerAdapter", () => {
  let adapter: DefaultMcpServerAdapter;

  beforeEach(() => {
    mockExecutor.mockClear();
    adapter = new DefaultMcpServerAdapter(SAMPLE_TOOLS, mockExecutor);
  });

  afterEach(async () => {
    await adapter.stop();
  });

  it("returns registered tools", () => {
    const tools = adapter.getRegisteredTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("read_file");
    expect(tools[1].name).toBe("write_file");
  });

  it("handles initialize request", async () => {
    await adapter.start({ name: "test-server", version: "0.1.0", transport: "stdio" });

    const response = await adapter.handleRequest({
      jsonrpc: "2.0",
      id: "1",
      method: "initialize",
    });

    expect(response.result).toEqual({
      protocolVersion: "2024-11-05",
      serverInfo: { name: "test-server", version: "0.1.0" },
      capabilities: { tools: { listChanged: false } },
    });
  });

  it("handles tools/list request", async () => {
    const response = await adapter.handleRequest({
      jsonrpc: "2.0",
      id: "2",
      method: "tools/list",
    });

    const result = response.result as { tools: McpToolServerDefinition[] };
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe("read_file");
    expect(result.tools[1].name).toBe("write_file");
    expect(result.tools[0].inputSchema).toBeDefined();
  });

  it("handles tools/call request for valid tool", async () => {
    const response = await adapter.handleRequest({
      jsonrpc: "2.0",
      id: "3",
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: { path: "/test.txt" },
      },
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({
      content: [{ type: "text", text: "Executed: read_file" }],
    });
    expect(mockExecutor).toHaveBeenCalledWith("read_file", { path: "/test.txt" });
  });

  it("returns error for unknown tool", async () => {
    const response = await adapter.handleRequest({
      jsonrpc: "2.0",
      id: "4",
      method: "tools/call",
      params: { name: "nonexistent_tool", arguments: {} },
    });

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32601);
    expect(response.error!.message).toContain("nonexistent_tool");
  });

  it("returns error for unknown method", async () => {
    const response = await adapter.handleRequest({
      jsonrpc: "2.0",
      id: "5",
      method: "unknown/method",
    });

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32601);
    expect(response.error!.message).toContain("Method not found");
  });

  it("handles tool execution errors gracefully", async () => {
    const failingExecutor = vi.fn(async () => {
      throw new Error("Tool crashed");
    });
    const errorAdapter = new DefaultMcpServerAdapter(SAMPLE_TOOLS, failingExecutor);

    const response = await errorAdapter.handleRequest({
      jsonrpc: "2.0",
      id: "6",
      method: "tools/call",
      params: { name: "read_file", arguments: {} },
    });

    expect(response.error).toBeUndefined();
    const result = response.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Tool crashed");
  });

  it("filters tools when toolFilter is provided", async () => {
    await adapter.start({
      name: "filtered-server",
      version: "1.0.0",
      transport: "stdio",
      toolFilter: ["read_file"],
    });

    const tools = adapter.getRegisteredTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("read_file");
  });

  it("handles notifications/initialized method", async () => {
    const response = await adapter.handleRequest({
      jsonrpc: "2.0",
      id: "7",
      method: "notifications/initialized",
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({});
  });

  it("starts and stops SSE transport", async () => {
    await adapter.start({
      name: "sse-server",
      version: "1.0.0",
      transport: "sse",
      port: 0, // random port — won't actually bind in test if we stop immediately
    });
    // Just verifying no errors on start/stop cycle
    await adapter.stop();
  });
});

// ── McpServerPlugin tests ─────────────────────────────────────────────────

describe("McpServerPlugin", () => {
  it("collects tool definitions during setup", async () => {
    const plugin = new McpServerPlugin();
    const ctx = createSetupContext(["read_file", "write_file", "grep"]);
    await plugin.setup(ctx);

    const tools = plugin.getCollectedTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual(["read_file", "write_file", "grep"]);
  });

  it("merges extra tools from options", async () => {
    const plugin = new McpServerPlugin({
      extraTools: [
        { name: "custom_tool", description: "A custom tool", inputSchema: { type: "object" } },
      ],
    });
    const ctx = createSetupContext(["read_file"]);
    await plugin.setup(ctx);

    const tools = plugin.getCollectedTools();
    expect(tools).toHaveLength(2);
    expect(tools[1].name).toBe("custom_tool");
  });

  it("registers mcp:start-server and mcp:stop-server tools", () => {
    const plugin = new McpServerPlugin();
    expect(plugin.tools["mcp:start-server"]).toBeDefined();
    expect(plugin.tools["mcp:stop-server"]).toBeDefined();
  });

  it("disposes adapter on plugin dispose", async () => {
    const plugin = new McpServerPlugin({
      executor: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    const ctx = createSetupContext();
    await plugin.setup(ctx);

    // Start then dispose
    const startTool = plugin.tools["mcp:start-server"] as { execute?: (args: unknown) => Promise<unknown> };
    await startTool.execute?.({ transport: "stdio" });
    expect(plugin.getAdapter()).toBeDefined();

    await plugin.dispose();
    expect(plugin.getAdapter()).toBeUndefined();
  });

  it("stop returns not_running when no server is active", async () => {
    const plugin = new McpServerPlugin();
    const stopTool = plugin.tools["mcp:stop-server"] as { execute?: (args: unknown) => Promise<unknown> };
    const result = await stopTool.execute?.({});
    expect(result).toEqual({ status: "not_running" });
  });
});
