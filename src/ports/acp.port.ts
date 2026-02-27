// =============================================================================
// ACP Server — Agent Client Protocol (JSON-RPC 2.0 over stdio)
// =============================================================================

export interface AcpMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface AcpSession {
  id: string;
  agentName: string;
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface AcpHandler {
  /** Handle an incoming ACP request, return the result */
  handle(method: string, params: unknown, session: AcpSession): Promise<unknown>;
}

export interface AcpServerPort {
  /** Register a method handler */
  registerHandler(handler: AcpHandler): void;

  /** Start the ACP server (stdio or TCP) */
  start(): Promise<void>;

  /** Stop the server */
  stop(): Promise<void>;

  /** Process a single JSON-RPC message (for testing) */
  processMessage(raw: string): Promise<AcpMessage>;
}
