// OnegenUiMcpAdapter — Adapter bridging @giulio-leone/gaussflow-mcp registry to McpPort

import type { McpRegistry } from "@giulio-leone/gaussflow-mcp";
import type {
  McpServerState,
  McpToolWireFormat,
} from "@giulio-leone/gaussflow-mcp";

import type {
  McpPort,
  McpToolDefinition,
  McpToolResult,
  McpServerInfo,
  McpServerConfig,
} from "../../ports/mcp.port.js";

export class OnegenUiMcpAdapter implements McpPort {
  private readonly registry: McpRegistry;
  private readonly executor?: (
    serverId: string,
    toolName: string,
    args: unknown,
  ) => Promise<McpToolResult>;

  constructor(options: {
    registry: McpRegistry;
    executor?: (
      serverId: string,
      toolName: string,
      args: unknown,
    ) => Promise<McpToolResult>;
  }) {
    this.registry = options.registry;
    this.executor = options.executor;
  }

  async discoverTools(): Promise<Record<string, McpToolDefinition>> {
    const result: Record<string, McpToolDefinition> = {};
    const states = this.registry.listServerStates();

    for (const [, state] of states) {
      if (!state.tools) continue;
      for (const tool of state.tools) {
        const namespacedName = `${state.config.id}:${tool.name}`;
        result[namespacedName] = mapWireToDef(tool, state, namespacedName);
      }
    }

    return result;
  }

  async executeTool(name: string, args: unknown): Promise<McpToolResult> {
    const colonIndex = name.indexOf(":");
    const serverId = colonIndex > -1 ? name.slice(0, colonIndex) : undefined;
    const toolName = colonIndex > -1 ? name.slice(colonIndex + 1) : name;

    if (this.executor) {
      return this.executor(serverId ?? "", toolName, args);
    }

    throw new Error(
      `Tool execution requires an executor function. ` +
        `Pass { executor } in constructor options.`,
    );
  }

  async listServers(): Promise<McpServerInfo[]> {
    const states = this.registry.listServerStates();
    const infos: McpServerInfo[] = [];

    for (const [, state] of states) {
      infos.push(mapStateToInfo(state));
    }

    return infos;
  }

  async connect(config: McpServerConfig): Promise<void> {
    const mcpConfig = mapConfigToRegistry(config);
    if (!this.registry.hasServer(config.id)) {
      this.registry.add(mcpConfig);
    }
    this.registry.setStatus(config.id, "connected");
  }

  async disconnect(serverId: string): Promise<void> {
    if (!this.registry.hasServer(serverId)) return;
    this.registry.setStatus(serverId, "disconnected");
  }

  async closeAll(): Promise<void> {
    const servers = this.registry.listServers();
    for (const server of servers) {
      this.registry.setStatus(server.id, "disconnected");
    }
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapWireToDef(
  tool: McpToolWireFormat,
  state: McpServerState,
  namespacedName: string,
): McpToolDefinition {
  return {
    name: namespacedName,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema as Record<string, unknown>,
    domain: state.config.domain,
  };
}

function mapStateToInfo(state: McpServerState): McpServerInfo {
  const transport = state.config.transport === "local"
    ? "stdio"
    : state.config.transport;

  return {
    id: state.config.id,
    name: state.config.name ?? state.config.id,
    status: state.status === "connecting" ? "disconnected" : state.status,
    toolCount: state.tools?.length ?? 0,
    transport: transport as "stdio" | "http" | "sse",
  };
}

function mapConfigToRegistry(
  config: McpServerConfig,
): import("@giulio-leone/gaussflow-mcp").McpServerConfig {
  if (config.transport === "stdio") {
    return {
      id: config.id,
      name: config.name,
      transport: "stdio",
      command: config.command ?? "",
      args: config.args,
      env: config.env,
    };
  }

  if (config.transport === "http" || config.transport === "sse") {
    return {
      id: config.id,
      name: config.name,
      transport: "http",
      url: config.url ?? "",
      headers: config.headers,
    };
  }

  return {
    id: config.id,
    name: config.name,
    transport: "http",
    url: config.url ?? "",
  };
}
