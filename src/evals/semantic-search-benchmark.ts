import type { SemanticSearchEvaluationSummary } from "./semantic-search-harness.js";

export interface SemanticSearchBenchmarkBaseline {
  recallAtK: number;
  meanReciprocalRank: number;
  passRate: number;
  citationCoverage: number;
  averageLatencyMs: number;
}

export interface SemanticSearchBenchmarkBudgets {
  maxRecallRegression: number;
  maxMrrRegression: number;
  maxPassRateRegression: number;
  maxCitationCoverageRegression: number;
  maxLatencyIncreaseMs: number;
}

export interface SemanticSearchBenchmarkComparison {
  baseline: SemanticSearchBenchmarkBaseline;
  current: SemanticSearchBenchmarkBaseline;
  deltas: {
    recallAtK: number;
    meanReciprocalRank: number;
    passRate: number;
    citationCoverage: number;
    averageLatencyMs: number;
  };
  budgets: SemanticSearchBenchmarkBudgets;
  budgetStatus: {
    recallAtK: boolean;
    meanReciprocalRank: boolean;
    passRate: boolean;
    citationCoverage: boolean;
    averageLatencyMs: boolean;
  };
  improvedMetrics: string[];
  regressedMetrics: string[];
  passed: boolean;
}

export const DEFAULT_SEMANTIC_BENCHMARK_BUDGETS: SemanticSearchBenchmarkBudgets = {
  maxRecallRegression: 0.02,
  maxMrrRegression: 0.02,
  maxPassRateRegression: 0.02,
  maxCitationCoverageRegression: 0.02,
  maxLatencyIncreaseMs: 250,
};

export function summaryToBenchmarkSnapshot(
  summary: SemanticSearchEvaluationSummary,
): SemanticSearchBenchmarkBaseline {
  return {
    recallAtK: summary.aggregate.recallAtK,
    meanReciprocalRank: summary.aggregate.meanReciprocalRank,
    passRate: summary.aggregate.passRate,
    citationCoverage: summary.aggregate.citationCoverage,
    averageLatencyMs: summary.aggregate.averageLatencyMs,
  };
}

export function compareSemanticSearchBenchmark(
  current: SemanticSearchBenchmarkBaseline,
  baseline: SemanticSearchBenchmarkBaseline,
  budgets: Partial<SemanticSearchBenchmarkBudgets> = {},
): SemanticSearchBenchmarkComparison {
  const resolvedBudgets: SemanticSearchBenchmarkBudgets = {
    ...DEFAULT_SEMANTIC_BENCHMARK_BUDGETS,
    ...budgets,
  };

  const deltas = {
    recallAtK: current.recallAtK - baseline.recallAtK,
    meanReciprocalRank: current.meanReciprocalRank - baseline.meanReciprocalRank,
    passRate: current.passRate - baseline.passRate,
    citationCoverage: current.citationCoverage - baseline.citationCoverage,
    averageLatencyMs: current.averageLatencyMs - baseline.averageLatencyMs,
  };

  const budgetStatus = {
    recallAtK: deltas.recallAtK >= -resolvedBudgets.maxRecallRegression,
    meanReciprocalRank:
      deltas.meanReciprocalRank >= -resolvedBudgets.maxMrrRegression,
    passRate: deltas.passRate >= -resolvedBudgets.maxPassRateRegression,
    citationCoverage:
      deltas.citationCoverage >= -resolvedBudgets.maxCitationCoverageRegression,
    averageLatencyMs: deltas.averageLatencyMs <= resolvedBudgets.maxLatencyIncreaseMs,
  };

  const improvedMetrics: string[] = [];
  const regressedMetrics: string[] = [];

  if (deltas.recallAtK > 0) improvedMetrics.push("recallAtK");
  if (deltas.meanReciprocalRank > 0) improvedMetrics.push("meanReciprocalRank");
  if (deltas.passRate > 0) improvedMetrics.push("passRate");
  if (deltas.citationCoverage > 0) improvedMetrics.push("citationCoverage");
  if (deltas.averageLatencyMs < 0) improvedMetrics.push("averageLatencyMs");

  if (deltas.recallAtK < 0) regressedMetrics.push("recallAtK");
  if (deltas.meanReciprocalRank < 0) regressedMetrics.push("meanReciprocalRank");
  if (deltas.passRate < 0) regressedMetrics.push("passRate");
  if (deltas.citationCoverage < 0) regressedMetrics.push("citationCoverage");
  if (deltas.averageLatencyMs > 0) regressedMetrics.push("averageLatencyMs");

  const passed =
    budgetStatus.recallAtK &&
    budgetStatus.meanReciprocalRank &&
    budgetStatus.passRate &&
    budgetStatus.citationCoverage &&
    budgetStatus.averageLatencyMs;

  return {
    baseline,
    current,
    deltas,
    budgets: resolvedBudgets,
    budgetStatus,
    improvedMetrics,
    regressedMetrics,
    passed,
  };
}

export function assertSemanticSearchBenchmarkGate(
  comparison: SemanticSearchBenchmarkComparison,
): void {
  if (comparison.passed) {
    return;
  }

  const issues: string[] = [];
  if (!comparison.budgetStatus.recallAtK) {
    issues.push(
      `recallAtK delta ${comparison.deltas.recallAtK.toFixed(3)} below budget -${comparison.budgets.maxRecallRegression}`,
    );
  }
  if (!comparison.budgetStatus.meanReciprocalRank) {
    issues.push(
      `meanReciprocalRank delta ${comparison.deltas.meanReciprocalRank.toFixed(3)} below budget -${comparison.budgets.maxMrrRegression}`,
    );
  }
  if (!comparison.budgetStatus.passRate) {
    issues.push(
      `passRate delta ${comparison.deltas.passRate.toFixed(3)} below budget -${comparison.budgets.maxPassRateRegression}`,
    );
  }
  if (!comparison.budgetStatus.citationCoverage) {
    issues.push(
      `citationCoverage delta ${comparison.deltas.citationCoverage.toFixed(3)} below budget -${comparison.budgets.maxCitationCoverageRegression}`,
    );
  }
  if (!comparison.budgetStatus.averageLatencyMs) {
    issues.push(
      `averageLatencyMs delta ${comparison.deltas.averageLatencyMs.toFixed(1)} exceeds budget +${comparison.budgets.maxLatencyIncreaseMs}`,
    );
  }

  throw new Error(`Semantic benchmark gate failed: ${issues.join("; ")}`);
}

export function renderSemanticSearchBenchmarkMarkdown(
  comparison: SemanticSearchBenchmarkComparison,
): string {
  return [
    "# Semantic Search Benchmark Report",
    "",
    `- Gate: ${comparison.passed ? "PASS" : "FAIL"}`,
    `- Improved metrics: ${comparison.improvedMetrics.join(", ") || "none"}`,
    `- Regressed metrics: ${comparison.regressedMetrics.join(", ") || "none"}`,
    "",
    "| Metric | Baseline | Current | Delta | Budget | Status |",
    "|---|---:|---:|---:|---:|:---:|",
    row(
      "recall@k",
      comparison.baseline.recallAtK,
      comparison.current.recallAtK,
      comparison.deltas.recallAtK,
      `>= -${comparison.budgets.maxRecallRegression}`,
      comparison.budgetStatus.recallAtK,
    ),
    row(
      "MRR",
      comparison.baseline.meanReciprocalRank,
      comparison.current.meanReciprocalRank,
      comparison.deltas.meanReciprocalRank,
      `>= -${comparison.budgets.maxMrrRegression}`,
      comparison.budgetStatus.meanReciprocalRank,
    ),
    row(
      "pass rate",
      comparison.baseline.passRate,
      comparison.current.passRate,
      comparison.deltas.passRate,
      `>= -${comparison.budgets.maxPassRateRegression}`,
      comparison.budgetStatus.passRate,
    ),
    row(
      "citation coverage",
      comparison.baseline.citationCoverage,
      comparison.current.citationCoverage,
      comparison.deltas.citationCoverage,
      `>= -${comparison.budgets.maxCitationCoverageRegression}`,
      comparison.budgetStatus.citationCoverage,
    ),
    row(
      "avg latency (ms)",
      comparison.baseline.averageLatencyMs,
      comparison.current.averageLatencyMs,
      comparison.deltas.averageLatencyMs,
      `<= +${comparison.budgets.maxLatencyIncreaseMs}`,
      comparison.budgetStatus.averageLatencyMs,
    ),
    "",
  ].join("\n");
}

function row(
  label: string,
  baseline: number,
  current: number,
  delta: number,
  budget: string,
  ok: boolean,
): string {
  return `| ${label} | ${baseline.toFixed(3)} | ${current.toFixed(3)} | ${delta.toFixed(3)} | ${budget} | ${ok ? "✅" : "❌"} |`;
}
