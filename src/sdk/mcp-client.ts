/**
 * MCP Client — consume tools from external MCP servers.
 *
 * Quick start:
 *   const client = new McpClient({ command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] });
 *   await client.connect();
 *   const tools = await client.listTools();
 *   const result = await client.callTool("read_file", { path: "README.md" });
 *   client.close();
 *
 * Supports stdio transport (spawn subprocess) for local MCP servers.
 *
 * @since 1.2.0
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import type { ToolDef, Handle, Disposable } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────

/** Configuration for creating an MCP client. */
export interface McpClientConfig {
  /** Command to spawn the MCP server process (stdio transport). */
  command: string;
  /** Arguments for the command. */
  args?: string[];
  /** Environment variables for the subprocess. */
  env?: Record<string, string>;
  /** Connection timeout in milliseconds (default: 10000). */
  timeoutMs?: number;
}

/** A tool definition from an MCP server. */
export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Result from calling a tool on an MCP server. */
export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

// ─── JSON-RPC Helpers ───────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// ─── McpClient Class ────────────────────────────────────────────────

/**
 * Client for consuming tools from external MCP (Model Context Protocol) servers.
 *
 * @description Connects to an MCP server via stdio transport (subprocess),
 * performs the initialization handshake, and provides methods to list and
 * call tools. Tools can be wired into agents via `agent.useMcpServer()`.
 *
 * @example
 * ```ts
 * const client = new McpClient({
 *   command: "npx",
 *   args: ["-y", "@modelcontextprotocol/server-everything"],
 * });
 * await client.connect();
 *
 * const tools = await client.listTools();
 * console.log(tools); // [{ name: "echo", description: "...", parameters: {...} }]
 *
 * const result = await client.callTool("echo", { message: "hello" });
 * console.log(result); // { content: [{ type: "text", text: "hello" }] }
 *
 * client.close();
 * ```
 *
 * @since 1.2.0
 */
export class McpClient implements Disposable {
  private readonly config: McpClientConfig;
  private process: ChildProcess | null = null;
  private connected = false;
  private closed = false;
  private nextId = 1;
  private readonly pending = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private buffer = "";
  private serverCapabilities: Record<string, unknown> = {};
  private cachedTools: ToolDef[] | null = null;

  constructor(config: McpClientConfig) {
    this.config = config;
  }

  /**
   * Connect to the MCP server and perform the initialization handshake.
   *
   * @throws {Error} If connection times out or the server rejects initialization.
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.closed) throw new Error("McpClient has been closed");

    const timeout = this.config.timeoutMs ?? 10000;

    this.process = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env },
    });

    this.process.stdout!.on("data", (chunk: Buffer) => this.onData(chunk));
    this.process.stderr!.on("data", () => { /* discard stderr */ });
    this.process.on("error", (err) => this.onProcessError(err));
    this.process.on("close", () => this.onProcessClose());

    // Initialize handshake
    const initResult = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "gauss-mcp-client", version: "1.2.0" },
    }, timeout) as { capabilities?: Record<string, unknown> };

    this.serverCapabilities = initResult?.capabilities ?? {};

    // Send initialized notification
    this.notify("notifications/initialized", {});

    this.connected = true;
  }

  /**
   * List all tools available on the connected MCP server.
   *
   * @returns Array of tool definitions in Gauss SDK format.
   * @throws {Error} If not connected.
   */
  async listTools(): Promise<ToolDef[]> {
    this.assertConnected();

    if (this.cachedTools) return this.cachedTools;

    const result = await this.request("tools/list", {}) as {
      tools?: McpToolDef[];
    };

    const tools: ToolDef[] = (result?.tools ?? []).map(t => ({
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema,
    }));

    this.cachedTools = tools;
    return tools;
  }

  /**
   * Call a tool on the MCP server.
   *
   * @param toolName - Name of the tool to invoke.
   * @param args - Arguments to pass to the tool.
   * @returns The tool execution result.
   * @throws {Error} If not connected or the tool call fails.
   */
  async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    this.assertConnected();

    const result = await this.request("tools/call", {
      name: toolName,
      arguments: args,
    }) as McpToolResult;

    return result;
  }

  /**
   * Get all tools as Gauss ToolDefs with a wired ToolExecutor.
   *
   * @description Returns the tools and a ToolExecutor that routes
   * tool calls to this MCP server. Used by `agent.useMcpServer()`.
   *
   * @returns Object with `tools` (ToolDef[]) and `executor` (ToolExecutor).
   */
  async getToolsWithExecutor(): Promise<{
    tools: ToolDef[];
    executor: (callJson: string) => Promise<string>;
  }> {
    const tools = await this.listTools();

    const executor = async (callJson: string): Promise<string> => {
      let call: { tool?: string; name?: string; args?: unknown; arguments?: unknown };
      try {
        call = JSON.parse(callJson);
      } catch {
        return JSON.stringify({ error: "Invalid tool call JSON" });
      }

      const toolName = call.tool ?? call.name ?? "";
      const toolArgs = (call.args ?? call.arguments ?? {}) as Record<string, unknown>;

      try {
        const result = await this.callTool(toolName, toolArgs);
        if (result.isError) {
          const errorText = result.content?.map(c => c.text).filter(Boolean).join("\n") ?? "Tool error";
          return JSON.stringify({ error: errorText });
        }
        const text = result.content?.map(c => c.text).filter(Boolean).join("\n") ?? "";
        return JSON.stringify({ result: text });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: message });
      }
    };

    return { tools, executor };
  }

  /**
   * Close the connection and terminate the subprocess.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.cachedTools = null;

    // Reject all pending requests
    for (const [, { reject }] of this.pending) {
      reject(new Error("McpClient closed"));
    }
    this.pending.clear();

    if (this.process) {
      this.process.stdin!.end();
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  /** Alias for close() — enables `using` pattern. */
  destroy(): void { this.close(); }
  [Symbol.dispose](): void { this.close(); }

  /** Whether the client is currently connected. */
  get isConnected(): boolean { return this.connected; }

  // ─── Internal JSON-RPC ────────────────────────────────────────────

  private async request(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<unknown> {
    const id = this.nextId++;

    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.send(message);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    const message: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    this.send(message);
  }

  private send(message: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.process?.stdin?.writable) {
      throw new Error("MCP server process not available");
    }
    const json = JSON.stringify(message);
    this.process.stdin.write(json + "\n");
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf-8");

    // Process complete JSON-RPC messages (newline-delimited)
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (!line) continue;

      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);

          if (msg.error) {
            reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            resolve(msg.result);
          }
        }
        // Notifications from server are silently ignored for now
      } catch {
        // Malformed JSON — skip
      }
    }
  }

  private onProcessError(err: Error): void {
    for (const [, { reject }] of this.pending) {
      reject(new Error(`MCP process error: ${err.message}`));
    }
    this.pending.clear();
    this.connected = false;
  }

  private onProcessClose(): void {
    this.connected = false;
    for (const [, { reject }] of this.pending) {
      reject(new Error("MCP server process exited"));
    }
    this.pending.clear();
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error("McpClient is not connected. Call connect() first.");
    }
  }
}
