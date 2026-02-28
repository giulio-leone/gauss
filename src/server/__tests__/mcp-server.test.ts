import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "../mcp-server.js";
import type { Tool } from "../../core/llm/index.js";

function makeRequest(method: string, params?: Record<string, unknown>, id: number | string = 1) {
  return { jsonrpc: "2.0" as const, id, method, ...(params ? { params } : {}) };
}

describe("McpServer", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({
      name: "test-server",
      version: "0.1.0",
      tools: {
        greet: {
          description: "Say hello",
          parameters: { type: "object" as const, properties: { name: { type: "string" } } },
          execute: vi.fn(async (args: Record<string, unknown>) => `Hello, ${args.name}!`),
        },
      } as unknown as Record<string, Tool>,
    });
  });

  it("handles initialize request", async () => {
    const result = await server.handleRequest(makeRequest("initialize"));
    expect(result).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: expect.any(String),
        serverInfo: { name: "test-server", version: "0.1.0" },
        capabilities: { tools: {} },
      },
    });
  });

  it("handles tools/list request", async () => {
    const result = await server.handleRequest(makeRequest("tools/list"));
    expect(result).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "greet",
            description: "Say hello",
            inputSchema: expect.any(Object),
          },
        ],
      },
    });
  });

  it("handles tools/call request", async () => {
    const result = await server.handleRequest(
      makeRequest("tools/call", { name: "greet", arguments: { name: "World" } }),
    );
    expect(result).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: "Hello, World!" }],
      },
    });
  });

  it("returns method-not-found for unknown method", async () => {
    const result = await server.handleRequest(makeRequest("unknown/method"));
    expect(result).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32601,
        message: expect.stringContaining("not found"),
      },
    });
  });

  it("returns error for unknown tool name", async () => {
    const result = await server.handleRequest(
      makeRequest("tools/call", { name: "nonexistent", arguments: {} }),
    );
    expect(result).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: expect.any(Object),
    });
  });
});
