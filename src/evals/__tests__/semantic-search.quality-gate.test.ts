import { describe, expect, it } from "vitest";

import type {
  ReRankingOptions,
  ReRankingPort,
  ScoredResult,
} from "../../ports/reranking.port.js";
import { ToolCache } from "../../adapters/resilience/tool-cache.js";
import { SemanticWebSearchPlugin } from "../../plugins/semantic-web-search.plugin.js";
import {
  assertSemanticSearchQualityGate,
  evaluateSemanticSearchSuite,
  type SemanticSearchEvalCase,
} from "../semantic-search-harness.js";

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

const crawlerFixtures: Record<string, Array<{ title: string; url: string; snippet: string }>> = {
  "gauss flow memory tiering": [
    {
      title: "Gauss Memory Tiering",
      url: "https://gauss.dev/docs/memory-tiering",
      snippet: "Memory tiering in Gauss",
    },
    {
      title: "Noise",
      url: "https://example.com/noise-1",
      snippet: "noise",
    },
  ],
  "mcp policy engine allow deny": [
    {
      title: "Gauss MCP Policy Engine",
      url: "https://gauss.dev/docs/mcp-policy-engine",
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
      title: "Gauss Semantic Web Search",
      url: "https://gauss.dev/docs/semantic-web-search",
      snippet: "Search rerank citation",
    },
    {
      title: "Noise",
      url: "https://example.com/noise-3",
      snippet: "noise",
    },
  ],
};

describe("semantic web search quality gate", () => {
  it("meets semantic search quality thresholds on deterministic suite", async () => {
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
        expectedUrls: ["https://gauss.dev/docs/memory-tiering"],
      },
      {
        id: "mcp-policy",
        query: "mcp policy engine allow deny",
        expectedUrls: ["https://gauss.dev/docs/mcp-policy-engine"],
      },
      {
        id: "semantic-search",
        query: "semantic web search citation",
        expectedUrls: ["https://gauss.dev/docs/semantic-web-search"],
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

    expect(summary.passed).toBe(true);
    expect(() => assertSemanticSearchQualityGate(summary)).not.toThrow();
  });
});
