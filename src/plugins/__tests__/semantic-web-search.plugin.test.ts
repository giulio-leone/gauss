import { describe, expect, it, vi } from "vitest";

import type {
  ReRankingOptions,
  ReRankingPort,
  ScoredResult,
} from "../../ports/reranking.port.js";
import { ToolCache } from "../../adapters/resilience/tool-cache.js";
import { SemanticWebSearchPlugin } from "../semantic-web-search.plugin.js";

function createMockReranker(): ReRankingPort {
  return {
    rerank: vi.fn((query: string, results: ScoredResult[]) => {
      const lowered = query.toLowerCase();
      return [...results]
        .map((result) => ({
          ...result,
          score: result.text.toLowerCase().includes(lowered) ? 1 : 0.5,
        }))
        .sort((a, b) => b.score - a.score);
    }),
  };
}

describe("SemanticWebSearchPlugin", () => {
  it("returns ranked web results with citations", async () => {
    const mockCrawler = {
      search: vi.fn().mockResolvedValue([
        {
          title: "GaussFlow docs",
          url: "https://gaussflow.dev/docs",
          snippet: "Official docs",
        },
        {
          title: "Mastra overview",
          url: "https://mastra.ai/overview",
          snippet: "Mastra framework",
        },
      ]),
      crawl: vi.fn().mockResolvedValue({ content: "GaussFlow documentation content" }),
    };

    const plugin = new SemanticWebSearchPlugin({
      crawler: mockCrawler,
      reranker: createMockReranker(),
      cache: new ToolCache(),
    });

    const result = await (plugin.tools.semantic_web_search as any).execute({
      query: "gaussflow",
      limit: 2,
      scrapeTopK: 1,
      strategy: "bm25",
    });

    expect(result.results).toHaveLength(2);
    expect(result.citations).toHaveLength(2);
    expect(result.results[0]?.url).toBe("https://gaussflow.dev/docs");
    expect(result.quality.strategyUsed).toBe("bm25");
    expect(result.quality.searchAttempts).toBe(1);
    expect(result.quality.fallbackUsed).toBe(false);
    expect(result.cacheHit).toBe(false);
  });

  it("uses cache for repeated identical queries", async () => {
    const mockCrawler = {
      search: vi.fn().mockResolvedValue([
        {
          title: "Cached doc",
          url: "https://example.com/doc",
          snippet: "cache me",
        },
      ]),
      crawl: vi.fn().mockResolvedValue({ content: "Cached doc content" }),
    };

    const plugin = new SemanticWebSearchPlugin({
      crawler: mockCrawler,
      reranker: createMockReranker(),
      cache: new ToolCache(),
    });

    const execute = (plugin.tools.semantic_web_search as any).execute;

    const first = await execute({ query: "cache", limit: 1, scrapeTopK: 0 });
    const second = await execute({ query: "cache", limit: 1, scrapeTopK: 0 });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(mockCrawler.search).toHaveBeenCalledTimes(1);
  });

  it("surfaces crawler errors", async () => {
    const plugin = new SemanticWebSearchPlugin({
      crawler: {
        search: vi.fn().mockRejectedValue(new Error("search unavailable")),
      },
      reranker: createMockReranker(),
      cache: new ToolCache(),
    });

    await expect(
      (plugin.tools.semantic_web_search as any).execute({
        query: "failure",
      }),
    ).rejects.toThrow("search unavailable");
  });

  it("retries transient search failures", async () => {
    const mockCrawler = {
      search: vi
        .fn()
        .mockRejectedValueOnce(new Error("temp fail 1"))
        .mockRejectedValueOnce(new Error("temp fail 2"))
        .mockResolvedValue([
          {
            title: "Recovered",
            url: "https://example.com/recovered",
            snippet: "Recovered result",
          },
        ]),
    };

    const plugin = new SemanticWebSearchPlugin({
      crawler: mockCrawler,
      reranker: createMockReranker(),
      cache: new ToolCache(),
      maxRetries: 2,
      retryDelayMs: 1,
    });

    const result = await (plugin.tools.semantic_web_search as any).execute({
      query: "recovered",
      limit: 1,
      scrapeTopK: 0,
    });

    expect(result.results).toHaveLength(1);
    expect(result.quality.searchAttempts).toBe(3);
    expect(mockCrawler.search).toHaveBeenCalledTimes(3);
  });

  it("falls back to alternate reranking strategy", async () => {
    const reranker: ReRankingPort = {
      rerank: vi.fn(
        (query: string, results: ScoredResult[], options?: ReRankingOptions) => {
        if (options?.strategy === "bm25") {
          throw new Error("bm25 unavailable");
        }

        return [...results].map((item) => ({
          ...item,
          score: item.text.toLowerCase().includes(query.toLowerCase()) ? 1 : 0.1,
        }));
        },
      ),
    };

    const plugin = new SemanticWebSearchPlugin({
      crawler: {
        search: vi.fn().mockResolvedValue([
          {
            title: "Fallback candidate",
            url: "https://example.com/fallback",
            snippet: "fallback",
          },
        ]),
      },
      reranker,
      cache: new ToolCache(),
      defaultStrategy: "bm25",
      fallbackStrategy: "tfidf",
      fallbackOnRerankError: true,
    });

    const result = await (plugin.tools.semantic_web_search as any).execute({
      query: "fallback",
      limit: 1,
      scrapeTopK: 0,
    });

    expect(result.quality.fallbackUsed).toBe(true);
    expect(result.quality.strategyUsed).toBe("tfidf");
  });

  it("fails fast on timeout", async () => {
    const plugin = new SemanticWebSearchPlugin({
      crawler: {
        search: vi
          .fn()
          .mockImplementation(
            async () => await new Promise((resolve) => setTimeout(resolve, 30)),
          ),
      },
      reranker: createMockReranker(),
      cache: new ToolCache(),
      requestTimeoutMs: 5,
      maxRetries: 0,
    });

    await expect(
      (plugin.tools.semantic_web_search as any).execute({ query: "timeout" }),
    ).rejects.toThrow("timed out");
  });
});
