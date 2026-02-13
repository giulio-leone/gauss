// =============================================================================
// WebMcpAdapter — Future browser-native MCP via Chrome WebMCP API
// =============================================================================
//
// WebMCP is currently in Chrome Early Preview Program (as of Feb 2026).
// This adapter provides a forward-compatible interface that will bridge
// the WebMCP declarative/imperative APIs to our McpPort interface once
// the browser APIs are stable.
//
// See: https://developer.chrome.com/blog/webmcp-epp
// =============================================================================

import type {
  McpPort,
  McpToolDefinition,
  McpToolResult,
  McpServerInfo,
  McpServerConfig,
} from "../../ports/mcp.port.js";

export class WebMcpAdapter implements McpPort {
  constructor() {
    if (!this.isWebMcpAvailable()) {
      throw new Error(
        "WebMCP API is not available. It requires Chrome with the WebMCP flag enabled. " +
        "See: https://developer.chrome.com/blog/webmcp-epp",
      );
    }
  }

  private isWebMcpAvailable(): boolean {
    return typeof globalThis !== "undefined" && "ai" in globalThis;
  }

  async discoverTools(): Promise<Record<string, McpToolDefinition>> {
    throw new Error("WebMCP adapter is not yet implemented — awaiting stable API");
  }

  async executeTool(_name: string, _args: unknown): Promise<McpToolResult> {
    throw new Error("WebMCP adapter is not yet implemented — awaiting stable API");
  }

  async listServers(): Promise<McpServerInfo[]> {
    return [];
  }

  async connect(_config: McpServerConfig): Promise<void> {
    throw new Error("WebMCP adapter is not yet implemented — awaiting stable API");
  }

  async disconnect(_serverId: string): Promise<void> {
    // no-op
  }

  async closeAll(): Promise<void> {
    // no-op
  }
}
