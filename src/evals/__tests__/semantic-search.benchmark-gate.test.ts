import { describe, expect, it } from "vitest";

import type {
  ReRankingOptions,
  ReRankingPort,
  ScoredResult,
} from "../../ports/reranking.port.js";
import { ToolCache } from "../../adapters/resilience/tool-cache.js";
import { SemanticWebSearchPlugin } from "../../plugins/semantic-web-search.plugin.js";
import {
  evaluateSemanticSearchSuite,
  type SemanticSearchEvalCase,
} from "../semantic-search-harness.js";
import {
  assertSemanticSearchBenchmarkGate,
  compareSemanticSearchBenchmark,
  renderSemanticSearchBenchmarkMarkdown,
  summaryToBenchmarkSnapshot,
} from "../semantic-search-benchmark.js";

const deterministicReranker: ReRankingPort = {
  rerank: (query: string, results: ScoredResult[], _options?: ReRankingOptions) => {
    const q = query.toLowerCase();
    return [...results]
      .map((item) => ({
        ...item,
        score: item.text.toLowerCase().includes(q) ? 1 : 0.2,
      }))
      .sort((a, b) => b.score - a.score);
  },
};

const crawlerFixtures: Record<
  string,
  Array<{ title: string; url: string; snippet: string }>
> = {
  "gauss flow memory tiering": [
    {
      title: "GaussFlow Memory Tiering",
      url: "https://gaussflow.dev/docs/memory-tiering",
      snippet: "Memory tiering in GaussFlow",
    },
    {
      title: "Noise",
      url: "https://example.com/noise-1",
      snippet: "noise",
    },
  ],
  "mcp policy engine allow deny": [
    {
      title: "GaussFlow MCP Policy Engine",
      url: "https://gaussflow.dev/docs/mcp-policy-engine",
      snippet: "Allow deny governance",
    },
    {
      title: "Noise",
      url: "https://example.com/noise-2",
      snippet: "noise",
    },
  ],
  "semantic web search citation": [
    {
      title: "GaussFlow Semantic Web Search",
      url: "https://gaussflow.dev/docs/semantic-web-search",
      snippet: "Search rerank citation",
    },
    {
      title: "Noise",
      url: "https://example.com/noise-3",
      snippet: "noise",
    },
  ],
};

describe("semantic benchmark gate", () => {
  it("passes baseline comparison for deterministic semantic suite", async () => {
    const plugin = new SemanticWebSearchPlugin({
      crawler: {
        search: async (query: string) => crawlerFixtures[query] ?? [],
      },
      reranker: deterministicReranker,
      cache: new ToolCache(),
      maxRetries: 0,
      requestTimeoutMs: 500,
    });

    const suite: SemanticSearchEvalCase[] = [
      {
        id: "memory-tiering",
        query: "gauss flow memory tiering",
        expectedUrls: ["https://gaussflow.dev/docs/memory-tiering"],
      },
      {
        id: "mcp-policy",
        query: "mcp policy engine allow deny",
        expectedUrls: ["https://gaussflow.dev/docs/mcp-policy-engine"],
      },
      {
        id: "semantic-search",
        query: "semantic web search citation",
        expectedUrls: ["https://gaussflow.dev/docs/semantic-web-search"],
      },
    ];

    const execute = plugin.tools.semantic_web_search.execute as (
      input: {
        query: string;
        limit?: number;
        scrapeTopK?: number;
        strategy?: "tfidf" | "bm25" | "mmr";
      },
    ) => Promise<{
      results: Array<{ url: string; score: number; citation: string }>;
      citations: string[];
      quality: { durationMs: number };
      cacheHit: boolean;
    }>;

    const summary = await evaluateSemanticSearchSuite(
      suite,
      async (query, k) => {
        const output = await execute({
          query,
          limit: k,
          scrapeTopK: 0,
          strategy: "bm25",
        });
        return {
          results: output.results,
          citations: output.citations,
          quality: output.quality,
        };
      },
      {
        defaultK: 2,
        thresholds: {
          minRecallAtK: 1,
          minMeanReciprocalRank: 1,
          minPassRate: 1,
          minCitationCoverage: 1,
          maxAverageLatencyMs: 5_000,
        },
      },
    );

    const baseline = {
      recallAtK: 0.9,
      meanReciprocalRank: 0.9,
      passRate: 0.9,
      citationCoverage: 0.9,
      averageLatencyMs: 500,
    };

    const comparison = compareSemanticSearchBenchmark(
      summaryToBenchmarkSnapshot(summary),
      baseline,
      {
        maxLatencyIncreaseMs: 200,
      },
    );

    expect(comparison.passed).toBe(true);
    expect(() => assertSemanticSearchBenchmarkGate(comparison)).not.toThrow();

    const markdown = renderSemanticSearchBenchmarkMarkdown(comparison);
    expect(markdown).toContain("Semantic Search Benchmark Report");
    expect(markdown).toContain("Gate: PASS");
  });
});
