// =============================================================================
// DefaultMcpServerAdapter — Lightweight MCP server (stdio + SSE transports)
// =============================================================================

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type {
  McpServerPort,
  McpServerOptions,
  McpToolServerDefinition,
} from "../../ports/mcp-server.port.js";

// ── JSON-RPC types ──────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool executor function ──────────────────────────────────────────────────

export type McpToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>;

// ── Adapter ─────────────────────────────────────────────────────────────────

export class DefaultMcpServerAdapter implements McpServerPort {
  private tools: McpToolServerDefinition[] = [];
  private executor: McpToolExecutor;
  private options?: McpServerOptions;

  // stdio
  private stdinHandler?: (data: Buffer) => void;
  private stdinBuffer = "";

  // sse
  private httpServer?: Server;
  private sseClients = new Set<ServerResponse>();

  constructor(
    tools: McpToolServerDefinition[],
    executor: McpToolExecutor,
  ) {
    this.tools = tools;
    this.executor = executor;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getRegisteredTools(): McpToolServerDefinition[] {
    return [...this.tools];
  }

  setTools(tools: McpToolServerDefinition[]): void {
    this.tools = tools;
  }

  async start(options: McpServerOptions): Promise<void> {
    this.options = options;

    const filtered = options.toolFilter
      ? this.tools.filter((t) => options.toolFilter!.includes(t.name))
      : this.tools;
    this.tools = filtered;

    if (options.transport === "stdio") {
      this.startStdio();
    } else {
      await this.startSse(options.port ?? 3100);
    }
  }

  async stop(): Promise<void> {
    if (this.stdinHandler) {
      process.stdin.removeListener("data", this.stdinHandler);
      this.stdinHandler = undefined;
      this.stdinBuffer = "";
    }

    if (this.httpServer) {
      for (const client of this.sseClients) {
        client.end();
      }
      this.sseClients.clear();
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
      this.httpServer = undefined;
    }
  }

  // ── JSON-RPC handler ──────────────────────────────────────────────────

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: this.options?.name ?? "gaussflow-mcp-server",
              version: this.options?.version ?? "1.0.0",
            },
            capabilities: {
              tools: { listChanged: false },
            },
          },
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: this.tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        };

      case "tools/call": {
        const toolName = (params?.name as string) ?? "";
        const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};

        const toolDef = this.tools.find((t) => t.name === toolName);
        if (!toolDef) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Unknown tool: ${toolName}` },
          };
        }

        try {
          const result = await this.executor(toolName, toolArgs);
          return { jsonrpc: "2.0", id, result };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: String(err) }],
              isError: true,
            },
          };
        }
      }

      case "notifications/initialized":
        // Client notification, no response needed — return empty result
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  // ── Stdio transport ───────────────────────────────────────────────────

  private startStdio(): void {
    this.stdinBuffer = "";

    this.stdinHandler = (data: Buffer) => {
      this.stdinBuffer += data.toString("utf-8");

      let newlineIdx: number;
      while ((newlineIdx = this.stdinBuffer.indexOf("\n")) !== -1) {
        const line = this.stdinBuffer.slice(0, newlineIdx).trim();
        this.stdinBuffer = this.stdinBuffer.slice(newlineIdx + 1);

        if (!line) continue;

        this.processStdioLine(line).catch(() => {
          // silently ignore malformed input
        });
      }
    };

    process.stdin.on("data", this.stdinHandler);
  }

  private async processStdioLine(line: string): Promise<void> {
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      const errResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      };
      process.stdout.write(JSON.stringify(errResponse) + "\n");
      return;
    }

    // Notifications (id === null/undefined) don't require a response per spec,
    // but we still process them and skip sending if id is absent.
    const response = await this.handleRequest(request);
    if (request.id !== null && request.id !== undefined) {
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  }

  // ── SSE transport ─────────────────────────────────────────────────────

  private startSse(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => {
        this.handleHttpRequest(req, res).catch(() => {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end();
          }
        });
      });

      this.httpServer.once("error", reject);
      this.httpServer.listen(port, () => resolve());
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/sse" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "endpoint", url: "/message" })}\n\n`);
      this.sseClients.add(res);
      req.on("close", () => this.sseClients.delete(res));
      return;
    }

    if (url.pathname === "/message" && req.method === "POST") {
      const body = await this.readBody(req);
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(body) as JsonRpcRequest;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
        return;
      }

      const response = await this.handleRequest(request);
      const responseJson = JSON.stringify(response);

      // Send via SSE to all connected clients
      for (const client of this.sseClients) {
        client.write(`data: ${responseJson}\n\n`);
      }

      // Also respond directly
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(responseJson);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }
}
