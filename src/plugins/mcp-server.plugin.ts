// =============================================================================
// McpServerPlugin — Exposes agent tools as an MCP server
// =============================================================================

import { tool, type Tool } from "../core/llm/index.js";
import { z } from "zod";

import type {
  Plugin,
  PluginSetupContext,
} from "../ports/plugin.port.js";
import type { McpToolServerDefinition } from "../ports/mcp-server.port.js";
import { DefaultMcpServerAdapter } from "../adapters/mcp-server/default-mcp-server.adapter.js";

export interface McpServerPluginOptions {
  /** Default server name (default: "gaussflow-mcp-server") */
  name?: string;
  /** Default server version (default: "1.0.0") */
  version?: string;
  /** Additional static tool definitions to expose */
  extraTools?: McpToolServerDefinition[];
  /** Custom tool executor; defaults to looking up tools from setupContext */
  executor?: (name: string, args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }>;
}

const START_SCHEMA = z.object({
  transport: z.enum(["stdio", "sse"]).default("stdio"),
  port: z.number().optional(),
  toolFilter: z.array(z.string()).optional(),
});

const STOP_SCHEMA = z.object({});

export class McpServerPlugin implements Plugin {
  readonly name = "mcp-server";
  readonly version = "1.0.0";
  readonly tools: Record<string, Tool>;

  private adapter?: DefaultMcpServerAdapter;
  private readonly pluginOptions: McpServerPluginOptions;
  private collectedTools: McpToolServerDefinition[] = [];

  constructor(options: McpServerPluginOptions = {}) {
    this.pluginOptions = options;

    this.tools = {
      "mcp:start-server": tool({
        description:
          "Start an MCP server that exposes the agent's tools via MCP protocol. " +
          "Supports stdio (default) and sse transports.",
        inputSchema: START_SCHEMA,
        execute: async (input: unknown) => {
          const args = START_SCHEMA.parse(input ?? {});

          if (this.adapter) {
            await this.adapter.stop();
          }

          this.adapter = new DefaultMcpServerAdapter(
            this.collectedTools,
            this.pluginOptions.executor ?? this.defaultExecutor.bind(this),
          );

          await this.adapter.start({
            name: this.pluginOptions.name ?? "gaussflow-mcp-server",
            version: this.pluginOptions.version ?? "1.0.0",
            transport: args.transport,
            port: args.port,
            toolFilter: args.toolFilter,
          });

          const tools = this.adapter.getRegisteredTools();
          return {
            status: "started",
            transport: args.transport,
            port: args.transport === "sse" ? (args.port ?? 3100) : undefined,
            toolCount: tools.length,
            tools: tools.map((t) => t.name),
          };
        },
      }),

      "mcp:stop-server": tool({
        description: "Stop the running MCP server.",
        inputSchema: STOP_SCHEMA,
        execute: async () => {
          if (!this.adapter) {
            return { status: "not_running" };
          }
          await this.adapter.stop();
          this.adapter = undefined;
          return { status: "stopped" };
        },
      }),
    };
  }

  async setup(ctx: PluginSetupContext): Promise<void> {
    // Collect tool definitions from the agent context
    this.collectedTools = ctx.toolNames.map((name) => ({
      name,
      description: `Agent tool: ${name}`,
      inputSchema: { type: "object", properties: {} },
    }));

    // Merge extra tools
    if (this.pluginOptions.extraTools) {
      this.collectedTools.push(...this.pluginOptions.extraTools);
    }
  }

  async dispose(): Promise<void> {
    if (this.adapter) {
      await this.adapter.stop();
      this.adapter = undefined;
    }
  }

  /** Expose the underlying adapter for testing */
  getAdapter(): DefaultMcpServerAdapter | undefined {
    return this.adapter;
  }

  /** Expose collected tools for testing */
  getCollectedTools(): McpToolServerDefinition[] {
    return [...this.collectedTools];
  }

  private async defaultExecutor(
    name: string,
    _args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
    // Default executor returns a descriptive message.
    // In production use, a custom executor wired to the agent's ToolManager should be provided.
    return {
      content: [{ type: "text", text: `Tool "${name}" executed (no custom executor provided)` }],
    };
  }
}

export function createMcpServerPlugin(options?: McpServerPluginOptions): McpServerPlugin {
  return new McpServerPlugin(options);
}
