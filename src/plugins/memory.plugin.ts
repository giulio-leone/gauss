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
const REFLECTION_DEFAULT_LIMIT = 20;

const memoryTypeSchema = z.enum(["conversation", "fact", "preference", "task", "summary"]);
const memoryTierSchema = z.enum(["short", "working", "semantic", "observation"]);
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
          tier: memoryTierSchema.optional().describe("Optional memory tier"),
          importance: importanceSchema.describe("Importance score 0-1"),
        }),
        execute: async (args: unknown) => {
          const { content, type, tier, importance } = z.object({
            content: z.string(),
            type: memoryTypeSchema,
            tier: memoryTierSchema.optional(),
            importance: importanceSchema,
          }).parse(args);
          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            content,
            type,
            tier,
            timestamp: new Date().toISOString(),
            importance,
          };
          await this.adapter.store(entry);
          return `Stored memory entry ${entry.id} (type: ${type}${tier ? `, tier: ${tier}` : ""})`;
        },
      }),

      "memory:recall": tool({
        description: "Recall memories matching a query",
        inputSchema: z.object({
          query: z.string().optional().describe("Keyword search query"),
          type: memoryTypeSchema.optional().describe("Filter by type"),
          tier: memoryTierSchema.optional().describe("Filter by tier"),
          includeTiers: z.array(memoryTierSchema).optional().describe("Filter by multiple tiers"),
          limit: z.number().optional().describe("Max entries to return (default 10)"),
          minImportance: importanceSchema.describe("Minimum importance threshold"),
        }),
        execute: async (args: unknown) => {
          const { query, type, tier, includeTiers, limit, minImportance } = z.object({
            query: z.string().optional(),
            type: memoryTypeSchema.optional(),
            tier: memoryTierSchema.optional(),
            includeTiers: z.array(memoryTierSchema).optional(),
            limit: z.number().optional(),
            minImportance: importanceSchema,
          }).parse(args);
          const entries = await this.adapter.recall(query ?? "", {
            query,
            type,
            tier,
            includeTiers,
            limit,
            minImportance,
          });
          if (entries.length === 0) return "No memories found.";
          return entries
            .map((e) => `[${e.tier ?? "unknown"}:${e.type}] ${e.content}`)
            .join("\n");
        },
      }),

      "memory:observe": tool({
        description: "Store an observation entry in the observation tier",
        inputSchema: z.object({
          content: z.string().describe("Observation content"),
          importance: importanceSchema.describe("Importance score 0-1"),
        }),
        execute: async (args: unknown) => {
          const { content, importance } = z
            .object({
              content: z.string(),
              importance: importanceSchema,
            })
            .parse(args);

          const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            content,
            type: "summary",
            tier: "observation",
            timestamp: new Date().toISOString(),
            importance,
            metadata: { source: "observation" },
          };

          await this.adapter.store(entry);
          return `Stored observation ${entry.id}`;
        },
      }),

      "memory:reflect": tool({
        description:
          "Summarize observation-tier memories into a reflection memory",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .default(REFLECTION_DEFAULT_LIMIT)
            .describe("Max observation entries to summarize"),
          minImportance: importanceSchema.describe(
            "Minimum importance threshold for observations",
          ),
          targetTier: memoryTierSchema
            .default("semantic")
            .describe("Tier where reflection output will be stored"),
        }),
        execute: async (args: unknown) => {
          const { limit, minImportance, targetTier } = z
            .object({
              limit: z
                .number()
                .int()
                .min(1)
                .max(100)
                .default(REFLECTION_DEFAULT_LIMIT),
              minImportance: importanceSchema,
              targetTier: memoryTierSchema.default("semantic"),
            })
            .parse(args);

          const observations = await this.adapter.recall("", {
            tier: "observation",
            limit,
            minImportance,
          });

          if (observations.length === 0) {
            return "No observation memories found.";
          }

          const reflection = await this.adapter.summarize(observations);
          const reflectionEntry: MemoryEntry = {
            id: crypto.randomUUID(),
            content: reflection,
            type: "summary",
            tier: targetTier,
            timestamp: new Date().toISOString(),
            importance: 0.7,
            metadata: {
              source: "reflection",
              observationCount: observations.length,
            },
          };

          await this.adapter.store(reflectionEntry);

          return `Reflection stored in tier '${targetTier}' from ${observations.length} observation(s).\n\n${reflection}`;
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
      tier: "short",
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
