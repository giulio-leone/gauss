import { tool } from "ai";
import { z } from "zod";

import { BasePlugin } from "./base.plugin.js";
import { DefaultReRankingAdapter } from "../adapters/reranking/default-reranking.adapter.js";
import { CircuitBreaker } from "../adapters/resilience/circuit-breaker.js";
import { ToolCache } from "../adapters/resilience/tool-cache.js";
import type {
  ReRankingOptions,
  ReRankingPort,
  ScoredResult,
} from "../ports/reranking.port.js";

const strategySchema = z.enum(["tfidf", "bm25", "mmr"]);

type ReRankingStrategy = NonNullable<ReRankingOptions["strategy"]>;

interface CrawledSearchResult {
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
  description?: string;
  content?: string;
  text?: string;
}

interface NormalizedCandidate {
  id: string;
  title: string;
  url: string;
  snippet: string;
  content: string;
}

export interface SemanticWebSearchPluginOptions {
  apiKey?: string;
  crawler?: {
    search: (query: string, options?: { limit?: number }) => Promise<unknown>;
    crawl?: (url: string) => Promise<unknown>;
    close?: () => Promise<void>;
  };
  reranker?: ReRankingPort;
  cache?: ToolCache;
  circuitBreaker?: CircuitBreaker;
  defaultLimit?: number;
  defaultScrapeTopK?: number;
  defaultStrategy?: ReRankingStrategy;
  cacheTtlMs?: number;
}

export class SemanticWebSearchPlugin extends BasePlugin {
  readonly name = "Semantic Web Search";
  readonly description =
    "Native search→rerank→citation pipeline for high-quality web evidence.";

  private crawlerPromise: Promise<
    NonNullable<SemanticWebSearchPluginOptions["crawler"]>
  > | null = null;
  private readonly reranker: ReRankingPort;
  private readonly cache: ToolCache;
  private readonly circuitBreaker: CircuitBreaker;

  private readonly defaultLimit: number;
  private readonly defaultScrapeTopK: number;
  private readonly defaultStrategy: ReRankingStrategy;
  private readonly cacheTtlMs: number;

  constructor(private readonly options: SemanticWebSearchPluginOptions = {}) {
    super();
    this.reranker = options.reranker ?? new DefaultReRankingAdapter();
    this.cache = options.cache ?? new ToolCache();
    this.circuitBreaker = options.circuitBreaker ?? new CircuitBreaker();
    this.defaultLimit = options.defaultLimit ?? 5;
    this.defaultScrapeTopK = options.defaultScrapeTopK ?? 2;
    this.defaultStrategy = options.defaultStrategy ?? "bm25";
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
  }

  protected buildHooks() {
    return {};
  }

  get tools() {
    return {
      semantic_web_search: tool({
        description:
          "Search the web, rerank semantically and return ranked citations.",
        inputSchema: z.object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(20).optional(),
          scrapeTopK: z.number().int().min(0).max(10).optional(),
          strategy: strategySchema.optional(),
        }),
        execute: async (input: {
          query: string;
          limit?: number;
          scrapeTopK?: number;
          strategy?: ReRankingStrategy;
        }) => {
          const limit = input.limit ?? this.defaultLimit;
          const scrapeTopK = input.scrapeTopK ?? this.defaultScrapeTopK;
          const strategy = input.strategy ?? this.defaultStrategy;

          const cacheKey = `semantic-web:${input.query}:${limit}:${scrapeTopK}:${strategy}`;
          const cached = this.cache.get(cacheKey) as
            | {
                query: string;
                results: Array<{
                  rank: number;
                  score: number;
                  title: string;
                  url: string;
                  snippet: string;
                  citation: string;
                }>;
                citations: string[];
                cacheHit: boolean;
              }
            | undefined;
          if (cached) {
            return {
              ...cached,
              cacheHit: true,
            };
          }

          const crawler = await this.getCrawler();
          const rawSearch = await this.circuitBreaker.execute(async () =>
            crawler.search(input.query, { limit }),
          );

          const normalized = this.normalizeResults(rawSearch, limit);
          await this.enrichTopResults(normalized, scrapeTopK, crawler);

          const byId = new Map(normalized.map((candidate) => [candidate.id, candidate]));
          const toRank: ScoredResult[] = normalized.map((candidate) => ({
            id: candidate.id,
            text: candidate.content,
            score: 1,
          }));

          const reranked = this.reranker.rerank(input.query, toRank, {
            strategy,
          });

          const results = reranked.slice(0, limit).map((result, index) => {
            const source = byId.get(result.id);
            const title = source?.title ?? result.id;
            const url = source?.url ?? "";
            const snippet = source?.snippet ?? result.text.slice(0, 300);
            const citation = `[${index + 1}] ${title} — ${url}`;

            return {
              rank: index + 1,
              score: result.score,
              title,
              url,
              snippet,
              citation,
            };
          });

          const response = {
            query: input.query,
            results,
            citations: results.map((result) => result.citation),
            cacheHit: false,
          };

          this.cache.set(cacheKey, response, this.cacheTtlMs);
          return response;
        },
      }),
    };
  }

  async dispose(): Promise<void> {
    if (!this.crawlerPromise) return;
    const crawler = await this.crawlerPromise;
    await crawler?.close?.();
  }

  private getCrawler(): Promise<
    NonNullable<SemanticWebSearchPluginOptions["crawler"]>
  > {
    if (!this.crawlerPromise) {
      this.crawlerPromise = this.initCrawler();
    }
    return this.crawlerPromise;
  }

  private async initCrawler(): Promise<
    NonNullable<SemanticWebSearchPluginOptions["crawler"]>
  > {
    if (this.options.crawler) {
      return this.options.crawler;
    }

    try {
      // @ts-expect-error optional peer dependency loaded lazily
      const mod = await import("onecrawl");
      const CrawlerClass = mod.Crawler ?? mod.default?.Crawler ?? mod.default;
      return new CrawlerClass({
        ...(this.options.apiKey ? { apiKey: this.options.apiKey } : {}),
      });
    } catch {
      throw new Error(
        'SemanticWebSearchPlugin requires "onecrawl" package. Install it: pnpm add onecrawl',
      );
    }
  }

  private normalizeResults(raw: unknown, limit: number): NormalizedCandidate[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .slice(0, limit)
      .map((entry, index) => this.normalizeEntry(entry, index))
      .filter((entry): entry is NormalizedCandidate => entry !== null);
  }

  private normalizeEntry(
    entry: unknown,
    index: number,
  ): NormalizedCandidate | null {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const item = entry as CrawledSearchResult;
    const url = item.url ?? item.link;
    if (!url) {
      return null;
    }

    const title = item.title ?? `Result ${index + 1}`;
    const snippet = item.snippet ?? item.description ?? "";
    const content = item.content ?? item.text ?? snippet ?? title;

    return {
      id: `result-${index + 1}`,
      title,
      url,
      snippet,
      content,
    };
  }

  private async enrichTopResults(
    candidates: NormalizedCandidate[],
    scrapeTopK: number,
    crawler: NonNullable<SemanticWebSearchPluginOptions["crawler"]>,
  ): Promise<void> {
    if (!crawler.crawl || scrapeTopK <= 0) {
      return;
    }

    const targets = candidates.slice(0, Math.min(scrapeTopK, candidates.length));

    await Promise.all(
      targets.map(async (candidate) => {
        try {
          const raw = await this.circuitBreaker.execute(async () =>
            crawler.crawl!(candidate.url),
          );
          const normalized = this.normalizeCrawlContent(raw);
          if (normalized.length > 0) {
            candidate.content = normalized;
          }
        } catch {
          // Best-effort enrichment: keep original candidate content
        }
      }),
    );
  }

  private normalizeCrawlContent(raw: unknown): string {
    if (typeof raw === "string") {
      return raw;
    }

    if (raw && typeof raw === "object") {
      const item = raw as CrawledSearchResult;
      return item.content ?? item.text ?? item.snippet ?? item.description ?? "";
    }

    return "";
  }
}

export function createSemanticWebSearchPlugin(
  options: SemanticWebSearchPluginOptions = {},
): SemanticWebSearchPlugin {
  return new SemanticWebSearchPlugin(options);
}
