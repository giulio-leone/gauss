/**
 * McpServer SDK wrapper — Model Context Protocol server backed by Rust core.
 */
import {
  create_mcp_server,
  mcp_server_add_tool,
  mcpServerAddResource,
  mcpServerAddPrompt,
  mcp_server_handle,
  destroy_mcp_server,
} from "gauss-napi";

import type { Handle, Disposable, ToolDef } from "./types.js";

// ── MCP Types ──────────────────────────────────────────────────

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments: McpPromptArgument[];
}

export interface McpPromptMessage {
  role: "user" | "assistant";
  content: McpContent;
}

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: McpResourceContent };

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

export interface McpModelHint {
  name?: string;
}

export interface McpModelPreferences {
  hints?: McpModelHint[];
  costPriority?: number;
  speedPriority?: number;
  intelligencePriority?: number;
}

export interface McpSamplingMessage {
  role: "user" | "assistant";
  content: McpContent;
}

export interface McpSamplingRequest {
  messages: McpSamplingMessage[];
  modelPreferences?: McpModelPreferences;
  systemPrompt?: string;
  includeContext?: "none" | "thisServer" | "allServers";
  temperature?: number;
  maxTokens: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

export interface McpSamplingResponse {
  role: "assistant";
  content: McpContent;
  model: string;
  stopReason?: string;
}

// ── McpServer Class ────────────────────────────────────────────

export class McpServer implements Disposable {
  private readonly _handle: Handle;
  private disposed = false;

  constructor(name: string, version: string) {
    this._handle = create_mcp_server(name, version);
  }

  get handle(): Handle {
    return this._handle;
  }

  addTool(tool: ToolDef): this {
    this.assertNotDisposed();
    mcp_server_add_tool(this._handle, JSON.stringify(tool));
    return this;
  }

  addResource(resource: McpResource): this {
    this.assertNotDisposed();
    mcpServerAddResource(this._handle, JSON.stringify(resource));
    return this;
  }

  addPrompt(prompt: McpPrompt): this {
    this.assertNotDisposed();
    mcpServerAddPrompt(this._handle, JSON.stringify(prompt));
    return this;
  }

  async handleMessage(message: unknown): Promise<unknown> {
    this.assertNotDisposed();
    return mcp_server_handle(this._handle, JSON.stringify(message));
  }

  destroy(): void {
    if (!this.disposed) {
      this.disposed = true;
      try {
        destroy_mcp_server(this._handle);
      } catch {
        // Already destroyed.
      }
    }
  }

  [Symbol.dispose](): void {
    this.destroy();
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("McpServer has been destroyed");
    }
  }
}
