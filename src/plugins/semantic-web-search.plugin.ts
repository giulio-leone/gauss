import { tool } from "ai";
import { z } from "zod";

import { BasePlugin } from "./base.plugin.js";
import { DefaultReRankingAdapter } from "../adapters/reranking/default-reranking.adapter.js";
import { CircuitBreaker } from "../adapters/resilience/circuit-breaker.js";
import { ToolCache } from "../adapters/resilience/tool-cache.js";
import type {
  CostTokenUsage,
  CostTrackerPort,
} from "../ports/cost-tracker.port.js";
import type {
  ReRankingOptions,
  ReRankingPort,
  ScoredResult,
} from "../ports/reranking.port.js";
import type { TelemetryPort } from "../ports/telemetry.port.js";

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

interface SemanticWebSearchQuality {
  traceId: string;
  cacheServed: boolean;
  durationMs: number;
  strategyRequested: ReRankingStrategy;
  strategyUsed: ReRankingStrategy;
  fallbackUsed: boolean;
  candidates: number;
  reranked: number;
  averageScore: number;
  searchAttempts: number;
  scrapeAttempts: number;
  scrapeFailures: number;
}

interface SemanticWebSearchResponse {
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
  quality: SemanticWebSearchQuality;
  cost?: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalCost: number;
    currency: "USD";
  };
  cacheHit: boolean;
}

export interface SemanticWebSearchPluginOptions {
  apiKey?: string;
  crawler?: {
    search: (query: string, options?: { limit?: number }) => Promise<unknown>;
    crawl?: (url: string) => Promise<unknown>;
    close?: () => Promise<void>;
  };
  reranker?: ReRankingPort;
  telemetry?: TelemetryPort;
  costTracker?: CostTrackerPort;
  costModel?: string;
  emitTelemetry?: boolean;
  cache?: ToolCache;
  circuitBreaker?: CircuitBreaker;
  defaultLimit?: number;
  defaultScrapeTopK?: number;
  defaultStrategy?: ReRankingStrategy;
  fallbackStrategy?: ReRankingStrategy;
  fallbackOnRerankError?: boolean;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
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
  private readonly telemetry?: TelemetryPort;
  private readonly costTracker?: CostTrackerPort;
  private readonly costModel: string;
  private readonly emitTelemetry: boolean;
  private readonly cache: ToolCache;
  private readonly circuitBreaker: CircuitBreaker;

  private readonly defaultLimit: number;
  private readonly defaultScrapeTopK: number;
  private readonly defaultStrategy: ReRankingStrategy;
  private readonly fallbackStrategy: ReRankingStrategy;
  private readonly fallbackOnRerankError: boolean;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly cacheTtlMs: number;

  constructor(private readonly options: SemanticWebSearchPluginOptions = {}) {
    super();
    this.reranker = options.reranker ?? new DefaultReRankingAdapter();
    this.telemetry = options.telemetry;
    this.costTracker = options.costTracker;
    this.costModel = options.costModel ?? "gpt-5.2-mini";
    this.emitTelemetry = options.emitTelemetry ?? true;
    this.cache = options.cache ?? new ToolCache();
    this.circuitBreaker = options.circuitBreaker ?? new CircuitBreaker();
    this.defaultLimit = options.defaultLimit ?? 5;
    this.defaultScrapeTopK = options.defaultScrapeTopK ?? 2;
    this.defaultStrategy = options.defaultStrategy ?? "bm25";
    this.fallbackStrategy = options.fallbackStrategy ?? "tfidf";
    this.fallbackOnRerankError = options.fallbackOnRerankError ?? true;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 200;
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
          const startedAt = Date.now();
          const traceId = crypto.randomUUID();

          this.emitEvent("semantic_search_started", {
            traceId,
            query: input.query,
            limit,
            scrapeTopK,
            strategy,
          });

          const cacheKey = `semantic-web:${input.query}:${limit}:${scrapeTopK}:${strategy}`;
          const cached = this.cache.get(cacheKey) as SemanticWebSearchResponse | undefined;
          if (cached) {
            const cacheResponse: SemanticWebSearchResponse = {
              ...cached,
              quality: {
                ...cached.quality,
                traceId,
                cacheServed: true,
              },
              cacheHit: true,
            };

            this.emitEvent("semantic_search_cache_hit", {
              traceId,
              query: input.query,
              resultCount: cacheResponse.results.length,
            });
            this.emitMetric("semantic_search_cache_hit", 1, {
              strategy,
            });

            return {
              ...cacheResponse,
            };
          }

          try {
            const crawler = await this.getCrawler();
            const {
              value: rawSearch,
              attempts: searchAttempts,
            } = await this.executeWithRetry("search", async () =>
              crawler.search(input.query, { limit }),
            );

            const normalized = this.normalizeResults(rawSearch, limit);
            const { failures: scrapeFailures, attempts: scrapeAttempts } =
              await this.enrichTopResults(normalized, scrapeTopK, crawler);

            const byId = new Map(normalized.map((candidate) => [candidate.id, candidate]));
            const toRank: ScoredResult[] = normalized.map((candidate) => ({
              id: candidate.id,
              text: candidate.content,
              score: 1,
            }));

            let reranked: ScoredResult[];
            let strategyUsed: ReRankingStrategy = strategy;
            let fallbackUsed = false;

            try {
              reranked = this.reranker.rerank(input.query, toRank, {
                strategy,
              });
            } catch (error) {
              if (!this.fallbackOnRerankError || strategy === this.fallbackStrategy) {
                throw error;
              }

              reranked = this.reranker.rerank(input.query, toRank, {
                strategy: this.fallbackStrategy,
              });
              strategyUsed = this.fallbackStrategy;
              fallbackUsed = true;
            }

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

            const durationMs = Date.now() - startedAt;
            const quality: SemanticWebSearchQuality = {
              traceId,
              cacheServed: false,
              durationMs,
              strategyRequested: strategy,
              strategyUsed,
              fallbackUsed,
              candidates: normalized.length,
              reranked: reranked.length,
              averageScore: this.calculateAverageScore(reranked),
              searchAttempts,
              scrapeAttempts,
              scrapeFailures,
            };

            const cost = this.buildCostRecord(
              input.query,
              results,
              quality,
            );

            const response: SemanticWebSearchResponse = {
              query: input.query,
              results,
              citations: results.map((result) => result.citation),
              quality,
              ...(cost
                ? {
                    cost: {
                      model: this.costModel,
                      promptTokens: cost.promptTokens,
                      completionTokens: cost.completionTokens,
                      totalTokens: cost.totalTokens,
                      totalCost: cost.totalCost,
                      currency: "USD",
                    },
                  }
                : {}),
              cacheHit: false,
            };

            this.emitEvent("semantic_search_completed", {
              traceId,
              query: input.query,
              resultCount: results.length,
              durationMs,
              fallbackUsed,
              strategyUsed,
              cacheHit: false,
              ...(cost ? { totalCost: cost.totalCost, totalTokens: cost.totalTokens } : {}),
            });
            this.emitMetric("semantic_search_duration_ms", durationMs, {
              strategy: strategyUsed,
              fallback: fallbackUsed ? "true" : "false",
            });
            if (cost) {
              this.emitMetric("semantic_search_cost_usd", cost.totalCost, {
                model: this.costModel,
              });
            }

            this.cache.set(cacheKey, response, this.cacheTtlMs);
            return response;
          } catch (error) {
            this.emitEvent("semantic_search_failed", {
              traceId,
              query: input.query,
              durationMs: Date.now() - startedAt,
              error: error instanceof Error ? error.message : String(error),
            }, "ERROR");
            this.emitMetric("semantic_search_failure", 1, {
              strategy,
            });
            throw error;
          }
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
  ): Promise<{ failures: number; attempts: number }> {
    if (!crawler.crawl || scrapeTopK <= 0) {
      return { failures: 0, attempts: 0 };
    }

    const targets = candidates.slice(0, Math.min(scrapeTopK, candidates.length));
    let failures = 0;
    let attempts = 0;

    await Promise.all(
      targets.map(async (candidate) => {
        try {
          const result = await this.executeWithRetry("scrape", async () =>
            crawler.crawl!(candidate.url),
          );
          attempts += result.attempts;
          const raw = result.value;
          const normalized = this.normalizeCrawlContent(raw);
          if (normalized.length > 0) {
            candidate.content = normalized;
          }
        } catch {
          failures += 1;
          attempts += this.maxRetries + 1;
          // Best-effort enrichment: keep original candidate content
        }
      }),
    );

    return { failures, attempts };
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

  private async executeWithRetry<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<{ value: T; attempts: number }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const value = await this.circuitBreaker.execute(() =>
          this.withTimeout(operation(), `${label} attempt ${attempt}`),
        );
        return { value, attempts: attempt };
      } catch (error) {
        lastError = error;
        if (attempt <= this.maxRetries) {
          await this.sleep(this.retryDelayMs * attempt);
        }
      }
    }

    throw lastError;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    label: string,
  ): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateAverageScore(results: ScoredResult[]): number {
    if (results.length === 0) return 0;
    const sum = results.reduce((acc, item) => acc + item.score, 0);
    return sum / results.length;
  }

  private buildCostRecord(
    query: string,
    results: Array<{ title: string; snippet: string; citation: string }>,
    quality: SemanticWebSearchQuality,
  ):
    | {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        totalCost: number;
      }
    | undefined {
    if (!this.costTracker) {
      return undefined;
    }

    const promptTokens = this.estimateTokens(query);
    const completionText = results
      .map((result) => `${result.title}\n${result.snippet}\n${result.citation}`)
      .join("\n\n");
    const completionTokens = this.estimateTokens(completionText);
    const totalTokens = promptTokens + completionTokens;

    const usage: CostTokenUsage = {
      model: this.costModel,
      provider: "semantic-web-search",
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      timestamp: Date.now(),
    };

    const totalBefore = this.costTracker.getEstimate().totalCost;
    this.costTracker.recordUsage(usage);
    const totalAfter = this.costTracker.getEstimate().totalCost;
    const totalCost = Math.max(0, totalAfter - totalBefore);

    this.emitEvent("semantic_search_cost_recorded", {
      traceId: quality.traceId,
      model: this.costModel,
      promptTokens,
      completionTokens,
      totalTokens,
      totalCost,
    });

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      totalCost,
    };
  }

  private estimateTokens(text: string): number {
    if (text.trim().length === 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(text.length / 4));
  }

  private emitEvent(
    name: string,
    properties: Record<string, unknown>,
    status: "OK" | "ERROR" = "OK",
  ): void {
    if (!this.emitTelemetry || !this.telemetry) {
      return;
    }

    try {
      const span = this.telemetry.startSpan(name);
      for (const [key, value] of Object.entries(properties)) {
        span.setAttribute(key, this.toTelemetryAttribute(value));
      }
      span.setStatus(status);
      span.end();
    } catch {
      // Never break primary flow due to observability side effects.
    }
  }

  private emitMetric(
    name: string,
    value: number,
    tags?: Record<string, string>,
  ): void {
    if (!this.emitTelemetry || !this.telemetry) {
      return;
    }

    try {
      this.telemetry.recordMetric(name, value, tags);
    } catch {
      // Never break primary flow due to observability side effects.
    }
  }

  private toTelemetryAttribute(value: unknown): string | number | boolean {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (value === null || value === undefined) {
      return "";
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

export function createSemanticWebSearchPlugin(
  options: SemanticWebSearchPluginOptions = {},
): SemanticWebSearchPlugin {
  return new SemanticWebSearchPlugin(options);
}
