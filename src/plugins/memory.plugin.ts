// =============================================================================
// MemoryPlugin — Agent memory & context tools for DeepAgents
// =============================================================================

import { tool, type Tool } from "ai";
import { z } from "zod";

import type { DeepAgentPlugin, PluginHooks, PluginContext, AfterRunParams } from "../ports/plugin.port.js";
import type { AgentMemoryPort, MemoryEntry } from "../ports/agent-memory.port.js";
import { InMemoryAgentMemoryAdapter } from "../adapters/memory/in-memory-agent-memory.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared schema constants
// ─────────────────────────────────────────────────────────────────────────────

/** Max characters kept when summarizing memory entries */
const SUMMARY_MAX_LENGTH = 500;

const memoryTypeSchema = z.enum(["conversation", "fact", "preference", "task", "summary"]);
const importanceSchema = z.number().min(0).max(1).optional();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryPluginOptions {
  /** Memory adapter to use (defaults to InMemoryAgentMemoryAdapter) */
  adapter?: AgentMemoryPort;
  /** Automatically store conversation summaries after each run */
  autoStore?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export class MemoryPlugin implements DeepAgentPlugin {
  readonly name = "memory";
  readonly version = "1.0.0";
  readonly hooks: PluginHooks;
  readonly tools: Record<string, Tool>;

  private readonly adapter: AgentMemoryPort;

  constructor(options: MemoryPluginOptions = {}) {
    this.adapter = options.adapter ?? new InMemoryAgentMemoryAdapter();
    const autoStore = options.autoStore ?? false;
    this.hooks = autoStore ? { afterRun: this.onAfterRun.bind(this) } : {};
    this.tools = this.buildTools();
  }

  private buildTools(): Record<string, Tool> {
    return {
      "memory:store": tool({
        description: "Store a memory entry for future recall",
        inputSchema: z.object({
          content: z.string().describe("The content to remember"),
          type: memoryTypeSchema.describe("Type of memory"),
          importance: importanceSchema.describe("Importance score 0-1"),
        }),
        execute: async (args: unknown) => {
          const { content, type, importance } = z.object({
            content: z.string(),
            type: memoryTypeSchema,
            importance: importanceSchema,
          }).parse(args);
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            content,
            type,
            timestamp: new Date().toISOString(),
            importance,
          };
          await this.adapter.store(entry);
          return `Stored memory entry ${entry.id} (type: ${type})`;
        },
      }),

      "memory:recall": tool({
        description: "Recall memories matching a query",
        inputSchema: z.object({
          query: z.string().optional().describe("Keyword search query"),
          type: memoryTypeSchema.optional().describe("Filter by type"),
          limit: z.number().optional().describe("Max entries to return (default 10)"),
          minImportance: importanceSchema.describe("Minimum importance threshold"),
        }),
        execute: async (args: unknown) => {
          const { query, type, limit, minImportance } = z.object({
            query: z.string().optional(),
            type: memoryTypeSchema.optional(),
            limit: z.number().optional(),
            minImportance: importanceSchema,
          }).parse(args);
          const entries = await this.adapter.recall(query ?? "", { query, type, limit, minImportance });
          if (entries.length === 0) return "No memories found.";
          return entries.map((e) => `[${e.type}] ${e.content}`).join("\n");
        },
      }),

      "memory:stats": tool({
        description: "Get memory statistics",
        inputSchema: z.object({}),
        execute: async () => {
          const stats = await this.adapter.getStats();
          return JSON.stringify(stats, null, 2);
        },
      }),

      "memory:clear": tool({
        description: "Clear all stored memories",
        inputSchema: z.object({}),
        execute: async () => {
          await this.adapter.clear();
          return "All memories cleared.";
        },
      }),
    };
  }

  private async onAfterRun(_ctx: PluginContext, params: AfterRunParams): Promise<void> {
    const text = params.result.text;
    if (!text) return;

    const summary = text.length > SUMMARY_MAX_LENGTH ? text.slice(0, SUMMARY_MAX_LENGTH) + "..." : text;
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      content: summary,
      type: "summary",
      timestamp: new Date().toISOString(),
      importance: 0.5,
      sessionId: params.result.sessionId,
    };
    await this.adapter.store(entry);
  }

  /** Direct access to the underlying adapter */
  getAdapter(): AgentMemoryPort {
    return this.adapter;
  }
}

export function createMemoryPlugin(options?: MemoryPluginOptions): MemoryPlugin {
  return new MemoryPlugin(options);
}
