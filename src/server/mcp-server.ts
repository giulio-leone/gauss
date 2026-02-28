// =============================================================================
// McpServer — Expose Agent tools as an MCP Server
// =============================================================================
// Enables cross-language consumption (Python, Go, etc.) via Streamable HTTP.
// =============================================================================

import type { Tool } from "ai";

export interface McpServerOptions {
  name?: string;
  version?: string;
  tools: Record<string, Tool>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpServer {
  private readonly name: string;
  private readonly version: string;
  private readonly tools: Record<string, Tool>;

  constructor(options: McpServerOptions) {
    this.name = options.name ?? "gauss-agent";
    this.version = options.version ?? "1.0.0";
    this.tools = options.tools;
  }

  /** Handle a JSON-RPC request and return a JSON-RPC response */
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      switch (request.method) {
        case "initialize":
          return this.handleInitialize(request);
        case "tools/list":
          return this.handleToolsList(request);
        case "tools/call":
          return this.handleToolsCall(request);
        case "notifications/initialized":
          return { jsonrpc: "2.0", id: null };
        default:
          return {
            jsonrpc: "2.0",
            id: request.id ?? null,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          };
      }
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" },
      };
    }
  }

  private handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: this.name, version: this.version },
      },
    };
  }

  private handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
    const toolList = Object.entries(this.tools).map(([name, tool]) => {
      const t = tool as { description?: string; parameters?: { jsonSchema?: unknown } };
      return {
        name,
        description: t.description ?? "",
        inputSchema: t.parameters?.jsonSchema ?? { type: "object", properties: {} },
      };
    });
    return { jsonrpc: "2.0", id: request.id ?? null, result: { tools: toolList } };
  }

  private async handleToolsCall(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params ?? {};
    const toolName = params.name as string | undefined;
    const args = params.arguments as Record<string, unknown> | undefined;

    if (!toolName) {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32602, message: "Missing tool name" },
      };
    }

    const tool = this.tools[toolName] as { execute?: (args: unknown) => Promise<unknown> } | undefined;
    if (!tool?.execute) {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32602, message: `Unknown tool: ${toolName}` },
      };
    }

    try {
      const result = await tool.execute(args ?? {});
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
        },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          content: [{ type: "text", text: error instanceof Error ? error.message : "Tool execution failed" }],
          isError: true,
        },
      };
    }
  }
}
