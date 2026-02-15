// =============================================================================
// StreamableHttpMcpAdapter — Pure fetch-based MCP client via Streamable HTTP
// =============================================================================
// Works in ALL runtimes: Node, Deno, Bun, Edge, Browser.
// Implements the MCP Streamable HTTP transport protocol:
//   - JSON-RPC 2.0 over HTTP POST
//   - Server may respond with application/json or text/event-stream (SSE)
//   - Session management via Mcp-Session-Id header
// =============================================================================

import type {
  McpPort,
  McpToolDefinition,
  McpToolResult,
  McpServerInfo,
  McpServerConfig,
} from "../../ports/mcp.port.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ServerState {
  config: McpServerConfig;
  sessionId: string | null;
  connected: boolean;
  tools: Record<string, McpToolDefinition>;
}

export class StreamableHttpMcpAdapter implements McpPort {
  private readonly servers = new Map<string, ServerState>();
  private nextId = 1;

  constructor(options: { servers?: McpServerConfig[] } = {}) {
    for (const server of options.servers ?? []) {
      this.servers.set(server.id, {
        config: server,
        sessionId: null,
        connected: false,
        tools: {},
      });
    }
  }

  async connect(config: McpServerConfig): Promise<void> {
    if (!config.url) {
      throw new Error(`Server "${config.id}" requires a url for streamable-http transport`);
    }

    const initResp = await this.sendRaw(config.url, {
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "gaussflow-agent", version: "1.0.0" },
      },
    }, null, config.headers);

    const sessionId = initResp.headers.get("mcp-session-id");

    const body = await this.parseResponse(initResp);
    if (body.error) {
      throw new Error(`MCP initialize failed: ${body.error.message}`);
    }

    // Send "initialized" notification (no id, no response expected)
    await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        ...config.headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });

    this.servers.set(config.id, {
      config,
      sessionId,
      connected: true,
      tools: {},
    });
  }

  async discoverTools(): Promise<Record<string, McpToolDefinition>> {
    const result: Record<string, McpToolDefinition> = {};

    for (const [serverId, state] of this.servers) {
      if (!state.config.url || !state.connected) continue;

      const response = await this.sendRequest(
        state.config.url,
        { jsonrpc: "2.0", id: this.nextId++, method: "tools/list" },
        state.sessionId,
        state.config.headers,
      );

      if (response.error) {
        throw new Error(`tools/list failed on "${serverId}": ${response.error.message}`);
      }

      const tools = (response.result as { tools?: unknown[] })?.tools ?? [];
      for (const raw of tools) {
        const tool = raw as {
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        };
        const namespacedName = `${serverId}:${tool.name}`;
        const def: McpToolDefinition = {
          name: namespacedName,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema ?? {},
        };
        result[namespacedName] = def;
        state.tools[namespacedName] = def;
      }
    }

    return result;
  }

  async executeTool(name: string, args: unknown): Promise<McpToolResult> {
    const colonIndex = name.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Tool name must be prefixed with serverId: "${name}"`);
    }

    const serverId = name.slice(0, colonIndex);
    const toolName = name.slice(colonIndex + 1);
    const state = this.servers.get(serverId);

    if (!state || !state.config.url || !state.connected) {
      throw new Error(`Server "${serverId}" is not connected`);
    }

    const response = await this.sendRequest(
      state.config.url,
      {
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      },
      state.sessionId,
      state.config.headers,
    );

    if (response.error) {
      return {
        content: [{ type: "text", text: response.error.message }],
        isError: true,
      };
    }

    const result = response.result as {
      content?: { type: string; text?: string; data?: string; mimeType?: string }[];
      isError?: boolean;
    };

    return {
      content: (result?.content ?? []).map((c) => ({
        type: (c.type as "text" | "image" | "resource") ?? "text",
        text: c.text,
        data: c.data,
        mimeType: c.mimeType,
      })),
      isError: result?.isError ?? false,
    };
  }

  async listServers(): Promise<McpServerInfo[]> {
    const infos: McpServerInfo[] = [];
    for (const [id, state] of this.servers) {
      infos.push({
        id,
        name: state.config.name,
        status: state.connected ? "connected" : "disconnected",
        toolCount: Object.keys(state.tools).length,
        transport: state.config.transport,
      });
    }
    return infos;
  }

  async disconnect(serverId: string): Promise<void> {
    this.servers.delete(serverId);
  }

  async closeAll(): Promise<void> {
    this.servers.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async sendRequest(
    url: string,
    request: JsonRpcRequest,
    sessionId: string | null,
    extraHeaders?: Record<string, string>,
  ): Promise<JsonRpcResponse> {
    const resp = await this.sendRaw(url, request, sessionId, extraHeaders);
    return this.parseResponse(resp);
  }

  private async sendRaw(
    url: string,
    body: JsonRpcRequest | Record<string, unknown>,
    sessionId: string | null,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...extraHeaders,
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  private async parseResponse(response: Response): Promise<JsonRpcResponse> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      return this.parseSSEResponse(response);
    }

    return response.json() as Promise<JsonRpcResponse>;
  }

  private async parseSSEResponse(response: Response): Promise<JsonRpcResponse> {
    const text = await response.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (
            parsed.jsonrpc === "2.0" &&
            (parsed.result !== undefined || parsed.error !== undefined)
          ) {
            return parsed as JsonRpcResponse;
          }
        } catch {
          /* skip non-JSON lines */
        }
      }
    }
    throw new Error("No JSON-RPC response found in SSE stream");
  }
}
