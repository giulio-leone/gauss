// =============================================================================
// VectorlessPlugin — RAG/knowledge tools via @giulio-leone/gaussflow-vectorless
// =============================================================================

import { tool, type Tool } from "ai";
import { z } from "zod";

import type { PluginHooks } from "../ports/plugin.port.js";
import { BasePlugin } from "./base.plugin.js";
import type { ValidationPort } from "../ports/validation.port.js";
import { getValidator } from "./utils/get-validator.js";
import type { Chunk, ChunkingPort } from "../ports/chunking.port.js";
import type { ReRankingPort, ScoredResult, SourceAttribution } from "../ports/reranking.port.js";
import { DefaultChunkingAdapter } from "../adapters/chunking/index.js";
import { DefaultReRankingAdapter } from "../adapters/reranking/index.js";

/** Default maximum token count per RAG chunk */
const DEFAULT_MAX_TOKENS_PER_CHUNK = 512;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Entity {
  name?: string;
  label?: string;
  type?: string;
  category?: string;
}

interface KnowledgeBase {
  entities?: Entity[];
  relations?: unknown[];
  quotes?: unknown[];
}

export interface VectorlessPluginOptions {
  /** Pre-configured vectorless instance */
  vectorless?: unknown;
  /** Knowledge base — pre-loaded knowledge to query against */
  knowledgeBase?: unknown;
  /** Model to use for knowledge generation (default: uses vectorless default) */
  model?: unknown;
  /** Validation adapter (defaults to ZodValidationAdapter) */
  validator?: ValidationPort;
  /** Custom chunking adapter (defaults to DefaultChunkingAdapter) */
  chunkingAdapter?: ChunkingPort;
  /** Custom re-ranking adapter (defaults to DefaultReRankingAdapter) */
  rerankingAdapter?: ReRankingPort;
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
  private readonly validator: ValidationPort;
  readonly chunks: Map<string, Chunk> = new Map();
  readonly chunkingAdapter: ChunkingPort;
  readonly rerankingAdapter: ReRankingPort;
  private _toolsCache?: Record<string, Tool>;

  constructor(options: VectorlessPluginOptions = {}) {
    super();
    this.options = options;
    this.currentKnowledge = options.knowledgeBase ?? null;
    this.validator = getValidator(options);
    this.chunkingAdapter = options.chunkingAdapter ?? new DefaultChunkingAdapter();
    this.rerankingAdapter = options.rerankingAdapter ?? new DefaultReRankingAdapter();
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
      // @ts-expect-error — @giulio-leone/gaussflow-vectorless is an optional peer dependency
      const mod = await import("@giulio-leone/gaussflow-vectorless");
      return mod.default ?? mod;
    } catch {
      throw new Error(
        'VectorlessPlugin requires "@giulio-leone/gaussflow-vectorless" package. Install it: pnpm add @giulio-leone/gaussflow-vectorless',
      );
    }
  }

  get tools(): Record<string, Tool> {
    if (this._toolsCache) return this._toolsCache;
    const getVectorless = this.getVectorless.bind(this);
    const getKnowledge = () => this.currentKnowledge;
    const setKnowledge = (k: unknown) => { this.currentKnowledge = k; };
    const mergeKnowledge = (newK: unknown) => {
      const existing = this.currentKnowledge as Record<string, unknown> | null;
      const incoming = newK as Record<string, unknown> | null;
      if (!existing || !incoming) { this.currentKnowledge = incoming ?? existing; return; }
      const merged: Record<string, unknown> = { ...existing };
      for (const key of ['entities', 'relations', 'quotes']) {
        const a = Array.isArray(existing[key]) ? existing[key] as unknown[] : [];
        const b = Array.isArray(incoming[key]) ? incoming[key] as unknown[] : [];
        if (a.length > 0 || b.length > 0) merged[key] = [...a, ...b];
      }
      this.currentKnowledge = merged;
    };
    const validator = this.validator;
    const chunks = this.chunks;
    const chunkingAdapter = this.chunkingAdapter;
    const rerankingAdapter = this.rerankingAdapter;

    const toolsMap: Record<string, Tool> = {
      generate: tool({
        description: "Extract knowledge (entities, relations, quotes) from text. Must be called before query/search.",
        inputSchema: z.object({
          text: z.string().describe("The text to extract knowledge from"),
          topic: z.string().optional().describe("Optional topic to focus extraction on"),
        }),
        execute: async (args: unknown) => {
          const { text, topic } = validator.validateOrThrow<{ text: string; topic?: string }>(
            z.object({
              text: z.string(),
              topic: z.string().optional(),
            }),
            args,
          );
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
          const { question } = validator.validateOrThrow<{ question: string }>(
            z.object({ question: z.string() }),
            args,
          );
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
          const { query, limit } = validator.validateOrThrow<{ query: string; limit: number }>(
            z.object({
              query: z.string(),
              limit: z.number().min(1).max(50).default(10),
            }),
            args,
          );
          const knowledge = getKnowledge();
          if (!knowledge) return "No knowledge base loaded. Use knowledge:generate first.";
          const vl = await getVectorless();
          if (typeof vl.searchEntities === "function") {
            return await vl.searchEntities(query, knowledge, { limit });
          }
          // Fallback: filter entities by name match
          const kb = knowledge as KnowledgeBase | null;
          const entities: Entity[] = Array.isArray(kb?.entities) ? kb.entities : [];
          const lower = query.toLowerCase();
          return entities
            .filter((e: Entity) => (e.name ?? e.label ?? "").toLowerCase().includes(lower))
            .slice(0, limit);
        },
      }),

      list: tool({
        description: "List all entities in the current knowledge base",
        inputSchema: z.object({}),
        execute: async () => {
          const knowledge = getKnowledge();
          if (!knowledge) return "No knowledge base loaded. Use knowledge:generate first.";
          const kb = knowledge as KnowledgeBase;
          const entities: Entity[] = Array.isArray(kb.entities) ? kb.entities : [];
          return entities.map((e: Entity) => ({
            name: e.name ?? e.label ?? "unknown",
            type: e.type ?? e.category ?? "unknown",
          }));
        },
      }),

      // ─── Advanced RAG tools ──────────────────────────────────────────

      "rag:ingest": tool({
        description: "Chunk a document and extract knowledge from each chunk",
        inputSchema: z.object({
          text: z.string().describe("The document text to ingest"),
          source: z.string().optional().describe("Source identifier for attribution"),
          chunkingStrategy: z.enum(["fixed", "sliding-window", "semantic", "recursive"]).default("recursive").describe("Chunking strategy"),
          maxTokens: z.number().min(1).default(DEFAULT_MAX_TOKENS_PER_CHUNK).describe("Max tokens per chunk"),
          overlap: z.number().min(0).default(50).describe("Token overlap for sliding-window"),
        }),
        execute: async (args: unknown) => {
          const { text, source, chunkingStrategy, maxTokens, overlap } = validator.validateOrThrow<{
            text: string; source?: string; chunkingStrategy: string; maxTokens: number; overlap: number;
          }>(
            z.object({
              text: z.string(),
              source: z.string().optional(),
              chunkingStrategy: z.enum(["fixed", "sliding-window", "semantic", "recursive"]).default("recursive"),
              maxTokens: z.number().min(1).default(DEFAULT_MAX_TOKENS_PER_CHUNK),
              overlap: z.number().min(0).default(50),
            }),
            args,
          );

          const produced = chunkingAdapter.chunk(text, {
            strategy: chunkingStrategy as "fixed" | "sliding-window" | "semantic" | "recursive",
            maxTokens,
            overlap,
          });

          for (const c of produced) {
            c.metadata.source = source;
            chunks.set(c.id, c);
          }

          // Also extract knowledge via vectorless if available
          try {
            const vl = await getVectorless();
            const generate = vl.generateKnowledge ?? vl.generate ?? vl.extract;
            if (generate) {
              const knowledge = await generate(text, { topic: source });
              mergeKnowledge(knowledge);
            }
          } catch {
            // vectorless not available — chunks-only mode
          }

          return `Ingested ${produced.length} chunks (strategy: ${chunkingStrategy}, maxTokens: ${maxTokens})${source ? ` from "${source}"` : ""}`;
        },
      }),

      "rag:search": tool({
        description: "Hybrid search: combine entity search + keyword search, then re-rank results",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          limit: z.number().min(1).max(100).default(10).describe("Max results"),
          rerankerStrategy: z.enum(["tfidf", "bm25", "mmr"]).default("bm25").describe("Re-ranking strategy"),
          includeAttribution: z.boolean().default(true).describe("Include source attribution"),
        }),
        execute: async (args: unknown) => {
          const { query, limit, rerankerStrategy, includeAttribution } = validator.validateOrThrow<{
            query: string; limit: number; rerankerStrategy: string; includeAttribution: boolean;
          }>(
            z.object({
              query: z.string(),
              limit: z.number().min(1).max(100).default(10),
              rerankerStrategy: z.enum(["tfidf", "bm25", "mmr"]).default("bm25"),
              includeAttribution: z.boolean().default(true),
            }),
            args,
          );

          const candidates: ScoredResult[] = [];
          const queryLower = query.toLowerCase();
          const queryWords = queryLower.split(/\s+/);

          // 1. Entity search from knowledge base
          const knowledge = getKnowledge();
          if (knowledge) {
            const kb = knowledge as KnowledgeBase | null;
            const entities: Entity[] = Array.isArray(kb?.entities) ? kb.entities : [];
            for (const e of entities) {
              const name = (e.name ?? e.label ?? "").toLowerCase();
              if (name.includes(queryLower) || queryLower.includes(name)) {
                candidates.push({
                  id: `entity:${e.name ?? e.label}`,
                  text: `${e.name ?? e.label} (${e.type ?? e.category ?? "unknown"})`,
                  score: 0,
                });
              }
            }
          }

          // 2. Full-text keyword search across chunks
          for (const [, chunk] of chunks) {
            const chunkLower = chunk.text.toLowerCase();
            if (chunkLower.includes(queryLower) || queryWords.some((w) => chunkLower.includes(w))) {
              const result: ScoredResult = {
                id: chunk.id,
                text: chunk.text,
                score: 0,
              };
              if (includeAttribution) {
                result.source = {
                  chunkId: chunk.id,
                  chunkIndex: chunk.index,
                  documentId: chunk.metadata.source,
                  startOffset: chunk.metadata.startOffset,
                  endOffset: chunk.metadata.endOffset,
                  relevanceScore: 0,
                };
              }
              candidates.push(result);
            }
          }

          if (candidates.length === 0) return [];

          // 3. Re-rank
          const reranked = rerankingAdapter.rerank(query, candidates, {
            strategy: rerankerStrategy as "tfidf" | "bm25" | "mmr",
          });

          // Update attribution relevance scores
          const top = reranked.slice(0, limit);
          for (const r of top) {
            if (r.source) r.source.relevanceScore = r.score;
          }

          return top;
        },
      }),

      "rag:search-chunks": tool({
        description: "Search directly against stored chunks",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          limit: z.number().min(1).max(100).default(10).describe("Max results"),
        }),
        execute: async (args: unknown) => {
          const { query, limit } = validator.validateOrThrow<{ query: string; limit: number }>(
            z.object({
              query: z.string(),
              limit: z.number().min(1).max(100).default(10),
            }),
            args,
          );

          const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
          const results: Array<Chunk & { matchScore: number }> = [];

          for (const [, chunk] of chunks) {
            const chunkLower = chunk.text.toLowerCase();
            const matchCount = queryWords.filter((w) => chunkLower.includes(w)).length;
            if (matchCount > 0) {
              results.push({ ...chunk, matchScore: matchCount / queryWords.length });
            }
          }

          return results
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, limit)
            .map(({ matchScore, ...chunk }) => chunk);
        },
      }),
    };
    this._toolsCache = toolsMap;
    return toolsMap;
  }

  async dispose(): Promise<void> {
    this.currentKnowledge = null;
    this.vectorlessPromise = null;
    this.chunks.clear();
    this._toolsCache = undefined;
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
