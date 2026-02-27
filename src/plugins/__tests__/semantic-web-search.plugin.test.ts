import { describe, expect, it, vi } from "vitest";

import type { ReRankingPort, ScoredResult } from "../../ports/reranking.port.js";
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
});
