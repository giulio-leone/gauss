import { describe, expect, it } from "vitest";

import {
  assertSemanticSearchQualityGate,
  evaluateSemanticSearchSuite,
  type SemanticSearchEvalCase,
} from "../semantic-search-harness.js";

describe("semantic-search-harness", () => {
  it("computes stable aggregate metrics", async () => {
    const suite: SemanticSearchEvalCase[] = [
      {
        id: "case-1",
        query: "gauss memory tiers",
        expectedUrls: ["https://gauss.dev/docs/memory-tiering"],
      },
      {
        id: "case-2",
        query: "policy tools",
        expectedUrls: ["https://gauss.dev/docs/policy-tools"],
      },
    ];

    const summary = await evaluateSemanticSearchSuite(
      suite,
      async (query) => ({
        results: [
          {
            url:
              query.includes("memory")
                ? "https://gauss.dev/docs/memory-tiering"
                : "https://gauss.dev/docs/policy-tools",
            score: 0.98,
          },
        ],
        citations: ["[1] citation"],
        quality: { durationMs: 12 },
      }),
      {
        thresholds: {
          minRecallAtK: 1,
          minMeanReciprocalRank: 1,
          minPassRate: 1,
          minCitationCoverage: 1,
          maxAverageLatencyMs: 50,
        },
      },
    );

    expect(summary.aggregate.recallAtK).toBe(1);
    expect(summary.aggregate.meanReciprocalRank).toBe(1);
    expect(summary.aggregate.passRate).toBe(1);
    expect(summary.aggregate.citationCoverage).toBe(1);
    expect(summary.aggregate.averageLatencyMs).toBe(12);
    expect(summary.passed).toBe(true);
  });

  it("throws with detailed reason when gate fails", async () => {
    const suite: SemanticSearchEvalCase[] = [
      {
        id: "failing-case",
        query: "missing",
        expectedUrls: ["https://gauss.dev/docs/expected"],
      },
    ];

    const summary = await evaluateSemanticSearchSuite(
      suite,
      async () => ({
        results: [{ url: "https://gauss.dev/docs/other", score: 0.1 }],
        citations: [],
        quality: { durationMs: 100 },
      }),
      {
        thresholds: {
          minRecallAtK: 0.9,
          minMeanReciprocalRank: 0.9,
          minPassRate: 1,
          minCitationCoverage: 1,
          maxAverageLatencyMs: 50,
        },
      },
    );

    expect(() => assertSemanticSearchQualityGate(summary)).toThrow(
      "Semantic search quality gate failed",
    );
  });
});
