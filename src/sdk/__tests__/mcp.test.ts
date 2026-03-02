import { describe, it, expect } from "vitest";
import {
  McpServer,
  type McpResource,
  type McpPrompt,
  type McpContent,
  type McpPromptMessage,
  type McpPromptResult,
  type McpSamplingRequest,
  type McpSamplingResponse,
  type McpModelPreferences,
} from "../mcp.js";

describe("McpServer", () => {
  it("creates and destroys without error", () => {
    const server = new McpServer("test", "1.0.0");
    expect(server.handle).toBeGreaterThanOrEqual(0);
    server.destroy();
  });

  it("supports Symbol.dispose", () => {
    const server = new McpServer("disp", "1.0.0");
    server[Symbol.dispose]();
    expect(() => server.addTool({ name: "x", description: "x" })).toThrow(
      "McpServer has been destroyed",
    );
  });

  it("addTool returns this for chaining", () => {
    const server = new McpServer("chain", "1.0.0");
    const result = server
      .addTool({ name: "a", description: "tool a", parameters: { type: "object" } })
      .addTool({ name: "b", description: "tool b", parameters: { type: "object" } });
    expect(result).toBe(server);
    server.destroy();
  });

  it("addResource returns this for chaining", () => {
    const server = new McpServer("res", "1.0.0");
    const resource: McpResource = {
      uri: "file:///readme.md",
      name: "README",
      description: "Project readme",
      mimeType: "text/markdown",
    };
    const result = server.addResource(resource);
    expect(result).toBe(server);
    server.destroy();
  });

  it("addPrompt returns this for chaining", () => {
    const server = new McpServer("prompt", "1.0.0");
    const prompt: McpPrompt = {
      name: "summarize",
      description: "Summarize text",
      arguments: [{ name: "text", description: "Text to summarize", required: true }],
    };
    const result = server.addPrompt(prompt);
    expect(result).toBe(server);
    server.destroy();
  });

  it("handles tools/list JSON-RPC", async () => {
    const server = new McpServer("tools", "1.0.0");
    server.addTool({ name: "add", description: "Add numbers", parameters: { type: "object" } });
    const resp = (await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    })) as { result: { tools: Array<{ name: string }> } };
    expect(resp.result.tools).toHaveLength(1);
    expect(resp.result.tools[0].name).toBe("add");
    server.destroy();
  });

  it("handles resources/list JSON-RPC", async () => {
    const server = new McpServer("res-list", "1.0.0");
    server.addResource({ uri: "file:///a.txt", name: "A" });
    server.addResource({ uri: "file:///b.txt", name: "B" });
    const resp = (await server.handleMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/list",
    })) as { result: { resources: Array<{ name: string }> } };
    expect(resp.result.resources).toHaveLength(2);
    server.destroy();
  });

  it("handles prompts/list JSON-RPC", async () => {
    const server = new McpServer("prompt-list", "1.0.0");
    server.addPrompt({
      name: "greet",
      description: "Greeting",
      arguments: [{ name: "name", required: true }],
    });
    const resp = (await server.handleMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "prompts/list",
    })) as { result: { prompts: Array<{ name: string }> } };
    expect(resp.result.prompts).toHaveLength(1);
    expect(resp.result.prompts[0].name).toBe("greet");
    server.destroy();
  });

  it("handles ping JSON-RPC", async () => {
    const server = new McpServer("ping", "1.0.0");
    const resp = (await server.handleMessage({
      jsonrpc: "2.0",
      id: 4,
      method: "ping",
    })) as { result: Record<string, unknown> };
    expect(resp.result).toEqual({});
    server.destroy();
  });

  it("includes capabilities for resources/prompts/tools", async () => {
    const server = new McpServer("caps", "1.0.0");
    server.addTool({ name: "t", description: "t", parameters: { type: "object" } });
    server.addResource({ uri: "file:///x", name: "x" });
    server.addPrompt({ name: "p", arguments: [] });
    const resp = (await server.handleMessage({
      jsonrpc: "2.0",
      id: 5,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    })) as { result: { capabilities: Record<string, unknown> } };
    expect(resp.result.capabilities).toHaveProperty("tools");
    expect(resp.result.capabilities).toHaveProperty("resources");
    expect(resp.result.capabilities).toHaveProperty("prompts");
    server.destroy();
  });

  it("full builder chain works", () => {
    const server = new McpServer("builder", "2.0.0");
    server
      .addTool({ name: "calc", description: "Calculator", parameters: { type: "object" } })
      .addResource({ uri: "file:///data.json", name: "Data" })
      .addPrompt({
        name: "analyze",
        description: "Analyze data",
        arguments: [{ name: "topic", required: true }],
      });
    server.destroy();
  });

  it("throws after destroy", () => {
    const server = new McpServer("dead", "1.0.0");
    server.destroy();
    expect(() => server.addResource({ uri: "x", name: "x" })).toThrow();
    expect(() => server.addPrompt({ name: "x", arguments: [] })).toThrow();
  });
});

describe("MCP types", () => {
  it("McpContent text variant", () => {
    const content: McpContent = { type: "text", text: "hello" };
    expect(content.type).toBe("text");
  });

  it("McpContent image variant", () => {
    const content: McpContent = {
      type: "image",
      data: "base64data",
      mimeType: "image/png",
    };
    expect(content.type).toBe("image");
  });

  it("McpContent resource variant", () => {
    const content: McpContent = {
      type: "resource",
      resource: { uri: "file:///x", text: "content" },
    };
    expect(content.type).toBe("resource");
  });

  it("McpPromptMessage structure", () => {
    const msg: McpPromptMessage = {
      role: "user",
      content: { type: "text", text: "Summarize this" },
    };
    expect(msg.role).toBe("user");
  });

  it("McpPromptResult structure", () => {
    const result: McpPromptResult = {
      description: "Summary",
      messages: [
        { role: "assistant", content: { type: "text", text: "Done" } },
      ],
    };
    expect(result.messages).toHaveLength(1);
  });

  it("McpSamplingRequest structure", () => {
    const req: McpSamplingRequest = {
      messages: [
        { role: "user", content: { type: "text", text: "Hello" } },
      ],
      maxTokens: 100,
      temperature: 0.7,
    };
    expect(req.maxTokens).toBe(100);
  });

  it("McpSamplingResponse structure", () => {
    const resp: McpSamplingResponse = {
      role: "assistant",
      content: { type: "text", text: "Hi there" },
      model: "gpt-4",
      stopReason: "end_turn",
    };
    expect(resp.model).toBe("gpt-4");
  });

  it("McpModelPreferences structure", () => {
    const prefs: McpModelPreferences = {
      hints: [{ name: "claude-3" }],
      costPriority: 0.3,
      speedPriority: 0.5,
      intelligencePriority: 0.9,
    };
    expect(prefs.hints).toHaveLength(1);
  });
});
