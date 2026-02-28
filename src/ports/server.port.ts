// =============================================================================
// ServerAdapterPort — Wraps Gauss agents as HTTP endpoints
// =============================================================================

/**
 * Server adapter port — wraps Gauss agents as HTTP endpoints.
 */
export interface ServerAdapterPort {
  /** Register an agent route */
  registerAgent(path: string, handler: AgentRouteHandler): void;

  /** Register a raw middleware */
  use(middleware: ServerMiddleware): void;

  /** Get the underlying framework handler (for mounting) */
  handler(): unknown;

  /** Start listening (optional — some frameworks handle this externally) */
  listen?(port: number, hostname?: string): Promise<void>;

  /** Stop the server */
  close?(): Promise<void>;
}

export interface AgentRouteHandler {
  (req: AgentRequest): Promise<AgentResponse>;
}

export interface AgentRequest {
  body: unknown;
  headers: Record<string, string>;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface AgentResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface ServerMiddleware {
  (req: AgentRequest, next: () => Promise<AgentResponse>): Promise<AgentResponse>;
}
