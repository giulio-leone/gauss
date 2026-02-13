// =============================================================================
// McpPort — MCP tool discovery and execution contract
// =============================================================================

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  domain?: string;
}

export interface McpToolResult {
  content: McpToolResultContent[];
  isError?: boolean;
}

export interface McpToolResultContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpServerInfo {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  toolCount: number;
  transport: "stdio" | "http" | "sse" | "streamable-http";
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface McpPort {
  /** Discover all available tools from connected MCP servers */
  discoverTools(): Promise<Record<string, McpToolDefinition>>;

  /** Execute a tool by name with given arguments */
  executeTool(name: string, args: unknown): Promise<McpToolResult>;

  /** List connected MCP servers */
  listServers(): Promise<McpServerInfo[]>;

  /** Connect to a new MCP server */
  connect(config: McpServerConfig): Promise<void>;

  /** Disconnect from an MCP server */
  disconnect(serverId: string): Promise<void>;

  /** Close all connections */
  closeAll(): Promise<void>;
}
