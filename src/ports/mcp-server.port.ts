// =============================================================================
// McpServerPort — Contract for exposing agent tools via MCP protocol
// =============================================================================

export interface McpServerPort {
  /** Start the MCP server with the given options */
  start(options: McpServerOptions): Promise<void>;

  /** Stop the MCP server */
  stop(): Promise<void>;

  /** Return all registered tool definitions */
  getRegisteredTools(): McpToolServerDefinition[];
}

export interface McpServerOptions {
  /** Server name advertised in initialize response */
  name: string;
  /** Server version advertised in initialize response */
  version: string;
  /** Transport type: stdio (line-delimited JSON-RPC) or sse (HTTP SSE) */
  transport: "stdio" | "sse";
  /** Port for SSE transport (default: 3100) */
  port?: number;
  /** Only expose tools whose names match this list */
  toolFilter?: string[];
}

export interface McpToolServerDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
