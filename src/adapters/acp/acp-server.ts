// =============================================================================
// ACP Server Adapter — Agent Client Protocol over JSON-RPC 2.0
// =============================================================================

import type {
  AcpServerPort,
  AcpHandler,
  AcpMessage,
  AcpSession,
} from "../../ports/acp.port.js";

/**
 * In-process ACP server implementation.
 * Processes JSON-RPC 2.0 messages, dispatches to registered handlers.
 *
 * Supports:
 * - Method routing to handlers
 * - Session management (initialize/shutdown lifecycle)
 * - Notification messages (no id → no response)
 * - Error handling with JSON-RPC error codes
 *
 * In production, connect this to a stdio transport or TCP socket.
 */
export class AcpServer implements AcpServerPort {
  private handlers: AcpHandler[] = [];
  private sessions = new Map<string, AcpSession>();
  private running = false;

  registerHandler(handler: AcpHandler): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.sessions.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  async processMessage(raw: string): Promise<AcpMessage> {
    let parsed: AcpMessage;
    try {
      parsed = JSON.parse(raw) as AcpMessage;
    } catch {
      return {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
      };
    }

    if (parsed.jsonrpc !== "2.0" || !parsed.method) {
      return {
        jsonrpc: "2.0",
        id: parsed.id,
        error: { code: -32600, message: "Invalid Request" },
      };
    }

    // Handle built-in lifecycle methods
    if (parsed.method === "initialize") {
      return this.handleInitialize(parsed);
    }
    if (parsed.method === "shutdown") {
      return this.handleShutdown(parsed);
    }

    // Find session for this request
    const sessionId = this.extractSessionId(parsed.params);
    const session = sessionId ? this.sessions.get(sessionId) : this.getDefaultSession();

    if (!session) {
      return {
        jsonrpc: "2.0",
        id: parsed.id,
        error: { code: -32001, message: "No active session" },
      };
    }

    // Dispatch to handlers
    for (const handler of this.handlers) {
      try {
        const result = await handler.handle(parsed.method, parsed.params, session);
        if (result !== undefined) {
          return {
            jsonrpc: "2.0",
            id: parsed.id,
            result,
          };
        }
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id: parsed.id,
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : "Internal error",
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id: parsed.id,
      error: { code: -32601, message: `Method not found: ${parsed.method}` },
    };
  }

  /** Process a batch of messages. */
  async processBatch(messages: string[]): Promise<AcpMessage[]> {
    return Promise.all(messages.map((m) => this.processMessage(m)));
  }

  /** Get all active sessions. */
  getSessions(): AcpSession[] {
    return [...this.sessions.values()];
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private handleInitialize(msg: AcpMessage): AcpMessage {
    const params = msg.params as Record<string, unknown> | undefined;
    const agentName = (params?.agentName as string) ?? "default";
    const sessionId = `acp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const session: AcpSession = {
      id: sessionId,
      agentName,
      createdAt: Date.now(),
      metadata: (params?.metadata as Record<string, unknown>) ?? {},
    };

    this.sessions.set(sessionId, session);

    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        sessionId,
        capabilities: {
          streaming: true,
          tools: true,
          memory: true,
        },
      },
    };
  }

  private handleShutdown(msg: AcpMessage): AcpMessage {
    const params = msg.params as Record<string, unknown> | undefined;
    const sessionId = params?.sessionId as string | undefined;

    if (sessionId) {
      this.sessions.delete(sessionId);
    }

    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: { success: true },
    };
  }

  private extractSessionId(params: unknown): string | undefined {
    if (params && typeof params === "object" && "sessionId" in params) {
      return (params as Record<string, unknown>).sessionId as string;
    }
    return undefined;
  }

  private getDefaultSession(): AcpSession | undefined {
    const sessions = [...this.sessions.values()];
    return sessions.length > 0 ? sessions[sessions.length - 1] : undefined;
  }
}
