// =============================================================================
// VectorlessPlugin — RAG/knowledge tools via @onegenui/vectorless
// =============================================================================

import { tool, type Tool } from "ai";
import { z } from "zod";

import type { PluginHooks } from "../ports/plugin.port.js";
import { BasePlugin } from "./base.plugin.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VectorlessPluginOptions {
  /** Pre-configured vectorless instance */
  vectorless?: unknown;
  /** Knowledge base — pre-loaded knowledge to query against */
  knowledgeBase?: unknown;
  /** Model to use for knowledge generation (default: uses vectorless default) */
  model?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export class VectorlessPlugin extends BasePlugin {
  readonly name = "knowledge";

  private readonly options: VectorlessPluginOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private vectorlessPromise: Promise<any> | null = null;
  private currentKnowledge: unknown = null;

  constructor(options: VectorlessPluginOptions = {}) {
    super();
    this.options = options;
    this.currentKnowledge = options.knowledgeBase ?? null;
  }

  protected buildHooks(): PluginHooks {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getVectorless(): Promise<any> {
    if (!this.vectorlessPromise) {
      this.vectorlessPromise = this.initVectorless();
    }
    return this.vectorlessPromise;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async initVectorless(): Promise<any> {
    if (this.options.vectorless) {
      return this.options.vectorless;
    }
    try {
      // @ts-expect-error — @onegenui/vectorless is an optional peer dependency
      const mod = await import("@onegenui/vectorless");
      return mod.default ?? mod;
    } catch {
      throw new Error(
        'VectorlessPlugin requires "@onegenui/vectorless" package. Install it: pnpm add @onegenui/vectorless',
      );
    }
  }

  get tools(): Record<string, Tool> {
    const getVectorless = this.getVectorless.bind(this);
    const getKnowledge = () => this.currentKnowledge;
    const setKnowledge = (k: unknown) => { this.currentKnowledge = k; };

    return {
      generate: tool({
        description: "Extract knowledge (entities, relations, quotes) from text. Must be called before query/search.",
        inputSchema: z.object({
          text: z.string().describe("The text to extract knowledge from"),
          topic: z.string().optional().describe("Optional topic to focus extraction on"),
        }),
        execute: async (args: unknown) => {
          const { text, topic } = z.object({
            text: z.string(),
            topic: z.string().optional(),
          }).parse(args);
          const vl = await getVectorless();
          const generate = vl.generateKnowledge ?? vl.generate ?? vl.extract;
          if (!generate) throw new Error("vectorless: generateKnowledge function not found");
          const knowledge = await generate(text, { topic });
          setKnowledge(knowledge);
          const summary = {
            entities: Array.isArray(knowledge?.entities) ? knowledge.entities.length : 0,
            relations: Array.isArray(knowledge?.relations) ? knowledge.relations.length : 0,
            quotes: Array.isArray(knowledge?.quotes) ? knowledge.quotes.length : 0,
          };
          return `Knowledge extracted: ${summary.entities} entities, ${summary.relations} relations, ${summary.quotes} quotes`;
        },
      }),

      query: tool({
        description: "Answer a question using the extracted knowledge base",
        inputSchema: z.object({
          question: z.string().describe("The question to answer"),
        }),
        execute: async (args: unknown) => {
          const { question } = z.object({ question: z.string() }).parse(args);
          const knowledge = getKnowledge();
          if (!knowledge) return "No knowledge base loaded. Use knowledge:generate first.";
          const vl = await getVectorless();
          const query = vl.queryKnowledge ?? vl.query ?? vl.ask;
          if (!query) throw new Error("vectorless: queryKnowledge function not found");
          const result = await query(question, knowledge);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
      }),

      "search-entities": tool({
        description: "Search for entities in the extracted knowledge base",
        inputSchema: z.object({
          query: z.string().describe("Search query for entities"),
          limit: z.number().min(1).max(50).default(10).describe("Max results"),
        }),
        execute: async (args: unknown) => {
          const { query, limit } = z
            .object({
              query: z.string(),
              limit: z.number().min(1).max(50).default(10),
            })
            .parse(args);
          const knowledge = getKnowledge();
          if (!knowledge) return "No knowledge base loaded. Use knowledge:generate first.";
          const vl = await getVectorless();
          if (typeof vl.searchEntities === "function") {
            return await vl.searchEntities(query, knowledge, { limit });
          }
          // Fallback: filter entities by name match
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const entities = Array.isArray((knowledge as any)?.entities) ? (knowledge as any).entities : [];
          const lower = query.toLowerCase();
          return entities
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((e: any) => (e.name ?? e.label ?? "").toLowerCase().includes(lower))
            .slice(0, limit);
        },
      }),

      list: tool({
        description: "List all entities in the current knowledge base",
        inputSchema: z.object({}),
        execute: async () => {
          const knowledge = getKnowledge();
          if (!knowledge) return "No knowledge base loaded. Use knowledge:generate first.";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const entities = Array.isArray((knowledge as any)?.entities) ? (knowledge as any).entities : [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return entities.map((e: any) => ({
            name: e.name ?? e.label ?? "unknown",
            type: e.type ?? e.category ?? "unknown",
          }));
        },
      }),
    };
  }

  async dispose(): Promise<void> {
    this.currentKnowledge = null;
    this.vectorlessPromise = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createVectorlessPlugin(
  options: VectorlessPluginOptions = {},
): VectorlessPlugin {
  return new VectorlessPlugin(options);
}
