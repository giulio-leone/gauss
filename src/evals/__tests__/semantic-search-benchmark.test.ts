import { describe, expect, it } from "vitest";

import {
  assertSemanticSearchBenchmarkGate,
  compareSemanticSearchBenchmark,
  renderSemanticSearchBenchmarkMarkdown,
} from "../semantic-search-benchmark.js";

describe("semantic-search-benchmark", () => {
  it("passes when current performance is within budgets", () => {
    const comparison = compareSemanticSearchBenchmark(
      {
        recallAtK: 0.97,
        meanReciprocalRank: 0.95,
        passRate: 0.98,
        citationCoverage: 0.99,
        averageLatencyMs: 110,
      },
      {
        recallAtK: 0.9,
        meanReciprocalRank: 0.88,
        passRate: 0.9,
        citationCoverage: 0.9,
        averageLatencyMs: 180,
      },
      {
        maxLatencyIncreaseMs: 300,
      },
    );

    expect(comparison.passed).toBe(true);
    expect(() => assertSemanticSearchBenchmarkGate(comparison)).not.toThrow();

    const markdown = renderSemanticSearchBenchmarkMarkdown(comparison);
    expect(markdown).toContain("Semantic Search Benchmark Report");
    expect(markdown).toContain("✅");
  });

  it("fails when quality regresses beyond budget", () => {
    const comparison = compareSemanticSearchBenchmark(
      {
        recallAtK: 0.7,
        meanReciprocalRank: 0.6,
        passRate: 0.7,
        citationCoverage: 0.8,
        averageLatencyMs: 700,
      },
      {
        recallAtK: 0.9,
        meanReciprocalRank: 0.9,
        passRate: 0.9,
        citationCoverage: 0.9,
        averageLatencyMs: 150,
      },
      {
        maxRecallRegression: 0.05,
        maxMrrRegression: 0.05,
        maxPassRateRegression: 0.05,
        maxCitationCoverageRegression: 0.05,
        maxLatencyIncreaseMs: 100,
      },
    );

    expect(comparison.passed).toBe(false);
    expect(() => assertSemanticSearchBenchmarkGate(comparison)).toThrow(
      "Semantic benchmark gate failed",
    );
  });
});
