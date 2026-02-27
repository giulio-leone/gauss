// =============================================================================
// ACP Server — JSON-RPC 2.0 implementation
// =============================================================================

import type { AcpServerPort, AcpMessage, AcpSession, AcpHandler } from "../../ports/acp.port.js";

let sessionCounter = 0;

function parseMessage(raw: string): AcpMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.jsonrpc !== "2.0") return null;
    return parsed as AcpMessage;
  } catch {
    return null;
  }
}

function errorResponse(id: string | number | undefined, code: number, message: string, data?: unknown): AcpMessage {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function successResponse(id: string | number | undefined, result: unknown): AcpMessage {
  return { jsonrpc: "2.0", id, result };
}

export class AcpServer implements AcpServerPort {
  private handler: AcpHandler | null = null;
  private sessions = new Map<string, AcpSession>();
  private defaultAgentName: string;
  private running = false;
  private stdinHandler: ((data: Buffer) => void) | null = null;

  constructor(opts: { agentName: string }) {
    this.defaultAgentName = opts.agentName;
  }

  registerHandler(handler: AcpHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    let buffer = "";
    let writeQueue = Promise.resolve();
    this.stdinHandler = (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Serialize responses to maintain request order
        writeQueue = writeQueue.then(async () => {
          const response = await this.processMessage(trimmed);
          process.stdout.write(JSON.stringify(response) + "\n");
        });
      }
    };
    process.stdin.on("data", this.stdinHandler);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.stdinHandler) {
      process.stdin.removeListener("data", this.stdinHandler);
      this.stdinHandler = null;
    }
    this.sessions.clear();
  }

  async processMessage(raw: string): Promise<AcpMessage> {
    const msg = parseMessage(raw);
    if (!msg) return errorResponse(undefined, -32700, "Parse error");
    if (!msg.method) return errorResponse(msg.id, -32600, "Invalid Request: missing method");

    // Built-in methods
    if (msg.method === "acp/initialize") {
      const sessionId = `session-${++sessionCounter}`;
      const session: AcpSession = {
        id: sessionId,
        agentName: this.defaultAgentName,
        createdAt: Date.now(),
        metadata: (msg.params as Record<string, unknown>) ?? {},
      };
      this.sessions.set(sessionId, session);
      return successResponse(msg.id, { sessionId, agentName: this.defaultAgentName, capabilities: ["chat", "tools"] });
    }

    if (msg.method === "acp/shutdown") {
      const params = msg.params as Record<string, unknown> | undefined;
      const sessionId = params?.sessionId as string | undefined;
      if (sessionId) this.sessions.delete(sessionId);
      return successResponse(msg.id, { ok: true });
    }

    // Route to handler
    if (!this.handler) return errorResponse(msg.id, -32601, "Method not found: no handler registered");

    // Find session from params
    const params = msg.params as Record<string, unknown> | undefined;
    const sessionId = params?.sessionId as string | undefined;
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session) {
      return errorResponse(msg.id, -32602, "Session not found: call acp/initialize first");
    }

    try {
      const result = await this.handler.handle(msg.method, msg.params, session);
      return successResponse(msg.id, result);
    } catch (err) {
      return errorResponse(msg.id, -32603, err instanceof Error ? err.message : "Internal error");
    }
  }
}
