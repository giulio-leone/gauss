declare module "@onegenui/mcp" {
  export interface McpToolWireFormat {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }

  export interface McpServerConfig {
    id: string;
    name?: string;
    domain?: string;
    transport: "stdio" | "http" | "sse" | "local";
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  }

  export interface McpServerState {
    config: McpServerConfig;
    status: "connected" | "disconnected" | "connecting";
    tools?: McpToolWireFormat[];
  }

  export interface McpRegistry {
    listServerStates(): Map<string, McpServerState>;
    hasServer(id: string): boolean;
    add(config: McpServerConfig): void;
    setStatus(id: string, status: "connected" | "disconnected"): void;
    listServers(): Array<{ id: string }>;
  }
}
