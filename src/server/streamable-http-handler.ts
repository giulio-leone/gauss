// =============================================================================
// Streamable HTTP Handler — Universal MCP HTTP handler using Web APIs
// =============================================================================
// Uses the standard Request/Response Web API, works in all runtimes.
// =============================================================================

import { McpServer } from "./mcp-server.js";

export interface StreamableHttpHandlerOptions {
  server: McpServer;
  sessionManager?: SessionManager;
}

export interface SessionManager {
  createSession(): string;
  isValidSession(id: string): boolean;
  deleteSession(id: string): void;
}

class InMemorySessionManager implements SessionManager {
  private readonly sessions = new Set<string>();

  createSession(): string {
    const id = crypto.randomUUID();
    this.sessions.add(id);
    return id;
  }

  isValidSession(id: string): boolean {
    return this.sessions.has(id);
  }

  deleteSession(id: string): void {
    this.sessions.delete(id);
  }
}

export function createStreamableHttpHandler(options: StreamableHttpHandlerOptions) {
  const { server } = options;
  const sessions = options.sessionManager ?? new InMemorySessionManager();

  return async (request: Request): Promise<Response> => {
    if (request.method === "DELETE") {
      const sessionId = request.headers.get("mcp-session-id");
      if (!sessionId || !sessions.isValidSession(sessionId)) {
        return new Response(null, { status: 404 });
      }
      sessions.deleteSession(sessionId);
      return new Response(null, { status: 200 });
    }

    if (request.method === "GET") {
      return new Response(null, { status: 405 });
    }

    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const isInit = body.method === "initialize";

    // Session validation: required for all non-init requests
    if (!isInit) {
      const sessionId = request.headers.get("mcp-session-id");
      if (!sessionId || !sessions.isValidSession(sessionId)) {
        return new Response(null, { status: 401 });
      }
    }

    // Handle notification (no id)
    if (!("id" in body)) {
      return new Response(null, { status: 202 });
    }

    const result = await server.handleRequest(body as any);

    const headers: Record<string, string> = { "Content-Type": "application/json" };

    // Assign session ID on initialize
    if (isInit && !result.error) {
      const sessionId = sessions.createSession();
      headers["Mcp-Session-Id"] = sessionId;
    }

    return new Response(JSON.stringify(result), { status: 200, headers });
  };
}
