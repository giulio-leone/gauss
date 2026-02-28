import { describe, expect, it } from "vitest";

import type {
  ReRankingOptions,
  ReRankingPort,
  ScoredResult,
} from "../../ports/reranking.port.js";
import { ToolCache } from "../../adapters/resilience/tool-cache.js";
import { DefaultCostTrackerAdapter } from "../../adapters/cost-tracker/default-cost-tracker.adapter.js";
import { SemanticWebSearchPlugin } from "../../plugins/semantic-web-search.plugin.js";
import {
  assertSemanticSearchStressGate,
  evaluateSemanticSearchStressSuite,
  type SemanticSearchStressSample,
} from "../semantic-search-stress-suite.js";

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

const fixtures: Record<string, Array<{ title: string; url: string; snippet: string }>> = {
  memory: [
    {
      title: "Memory tiering",
      url: "https://gauss.dev/docs/memory-tiering",
      snippet: "memory",
    },
  ],
  policy: [
    {
      title: "Policy engine",
      url: "https://gauss.dev/docs/mcp-policy-engine",
      snippet: "policy",
    },
  ],
  transient: [
    {
      title: "Transient recovery",
      url: "https://gauss.dev/docs/resilience",
      snippet: "resilience",
    },
  ],
  search: [
    {
      title: "Semantic search",
      url: "https://gauss.dev/docs/semantic-web-search",
      snippet: "search",
    },
  ],
};

describe("semantic stress gate", () => {
  it("passes operational stress gate on deterministic workload", async () => {
    const attempts = new Map<string, number>();

    const plugin = new SemanticWebSearchPlugin({
      crawler: {
        search: async (query: string) => {
          const current = (attempts.get(query) ?? 0) + 1;
          attempts.set(query, current);

          if (query === "transient" && current === 1) {
            throw new Error("temporary upstream failure");
          }

          return fixtures[query] ?? [];
        },
      },
      reranker: deterministicReranker,
      cache: new ToolCache(),
      costTracker: new DefaultCostTrackerAdapter(),
      maxRetries: 1,
      retryDelayMs: 1,
      requestTimeoutMs: 500,
    });

    const execute = plugin.tools.semantic_web_search.execute as (
      input: {
        query: string;
        limit?: number;
        scrapeTopK?: number;
        strategy?: "tfidf" | "bm25" | "mmr";
      },
    ) => Promise<{
      quality: { durationMs: number; fallbackUsed: boolean };
      cost?: { totalCost: number };
      cacheHit: boolean;
    }>;

    const workload = [
      "memory",
      "memory",
      "policy",
      "policy",
      "transient",
      "transient",
      "search",
      "search",
    ];

    const samples: SemanticSearchStressSample[] = [];

    for (const query of workload) {
      try {
        const output = await execute({
          query,
          limit: 1,
          scrapeTopK: 0,
          strategy: "bm25",
        });

        samples.push({
          success: true,
          durationMs: output.quality.durationMs,
          cacheHit: output.cacheHit,
          fallbackUsed: output.quality.fallbackUsed,
          totalCostUsd: output.cost?.totalCost ?? 0,
        });
      } catch {
        samples.push({
          success: false,
          durationMs: 5_000,
          cacheHit: false,
          fallbackUsed: true,
          totalCostUsd: 0,
        });
      }
    }

    const summary = evaluateSemanticSearchStressSuite(samples, {
      minSuccessRate: 1,
      maxP95LatencyMs: 2_000,
      minCacheHitRate: 0.25,
      maxFallbackRate: 0.25,
      maxAverageCostUsd: 0.01,
    });

    expect(summary.passed).toBe(true);
    expect(() => assertSemanticSearchStressGate(summary)).not.toThrow();
  });
});
