export interface SemanticSearchEvalCase {
  id: string;
  query: string;
  expectedUrls: string[];
  k?: number;
}

export interface SemanticSearchEvalResult {
  url: string;
  score?: number;
  citation?: string;
}

export interface SemanticSearchEvalRunOutput {
  results: SemanticSearchEvalResult[];
  citations?: string[];
  quality?: {
    durationMs?: number;
  };
}

export interface SemanticSearchCaseMetrics {
  caseId: string;
  query: string;
  k: number;
  recallAtK: number;
  reciprocalRank: number;
  citationCoverage: number;
  durationMs: number;
  pass: boolean;
}

export interface SemanticSearchQualityThresholds {
  minRecallAtK: number;
  minMeanReciprocalRank: number;
  minPassRate: number;
  minCitationCoverage: number;
  maxAverageLatencyMs: number;
}

export interface SemanticSearchEvaluationSummary {
  cases: SemanticSearchCaseMetrics[];
  aggregate: {
    recallAtK: number;
    meanReciprocalRank: number;
    passRate: number;
    citationCoverage: number;
    averageLatencyMs: number;
  };
  thresholds: SemanticSearchQualityThresholds;
  thresholdStatus: {
    recallAtK: boolean;
    meanReciprocalRank: boolean;
    passRate: boolean;
    citationCoverage: boolean;
    averageLatencyMs: boolean;
  };
  passed: boolean;
}

export interface SemanticSearchEvaluationOptions {
  defaultK?: number;
  thresholds?: Partial<SemanticSearchQualityThresholds>;
}

export type SemanticSearchRunner = (
  query: string,
  k: number,
) => Promise<SemanticSearchEvalRunOutput>;

export const DEFAULT_SEMANTIC_SEARCH_THRESHOLDS: SemanticSearchQualityThresholds = {
  minRecallAtK: 0.75,
  minMeanReciprocalRank: 0.6,
  minPassRate: 0.8,
  minCitationCoverage: 0.9,
  maxAverageLatencyMs: 5_000,
};

export async function evaluateSemanticSearchSuite(
  suite: readonly SemanticSearchEvalCase[],
  run: SemanticSearchRunner,
  options: SemanticSearchEvaluationOptions = {},
): Promise<SemanticSearchEvaluationSummary> {
  const defaultK = options.defaultK ?? 5;
  const thresholds: SemanticSearchQualityThresholds = {
    ...DEFAULT_SEMANTIC_SEARCH_THRESHOLDS,
    ...(options.thresholds ?? {}),
  };

  const cases: SemanticSearchCaseMetrics[] = [];

  for (const testCase of suite) {
    const k = testCase.k ?? defaultK;
    const output = await run(testCase.query, k);

    const retrieved = output.results.slice(0, k).map((result) => normalizeUrl(result.url));
    const expected = testCase.expectedUrls.map(normalizeUrl);

    const expectedSet = new Set(expected);
    const hits = retrieved.filter((url) => expectedSet.has(url)).length;
    const recallAtK = expected.length > 0 ? hits / expected.length : 1;

    const firstRelevantRank = retrieved.findIndex((url) => expectedSet.has(url));
    const reciprocalRank =
      firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0;

    const citationCoverage = computeCitationCoverage(output, retrieved.length);
    const durationMs =
      typeof output.quality?.durationMs === "number" && Number.isFinite(output.quality.durationMs)
        ? output.quality.durationMs
        : 0;

    cases.push({
      caseId: testCase.id,
      query: testCase.query,
      k,
      recallAtK,
      reciprocalRank,
      citationCoverage,
      durationMs,
      pass: reciprocalRank > 0,
    });
  }

  const aggregate = {
    recallAtK: average(cases.map((item) => item.recallAtK)),
    meanReciprocalRank: average(cases.map((item) => item.reciprocalRank)),
    passRate: average(cases.map((item) => (item.pass ? 1 : 0))),
    citationCoverage: average(cases.map((item) => item.citationCoverage)),
    averageLatencyMs: average(cases.map((item) => item.durationMs)),
  };

  const thresholdStatus = {
    recallAtK: aggregate.recallAtK >= thresholds.minRecallAtK,
    meanReciprocalRank:
      aggregate.meanReciprocalRank >= thresholds.minMeanReciprocalRank,
    passRate: aggregate.passRate >= thresholds.minPassRate,
    citationCoverage: aggregate.citationCoverage >= thresholds.minCitationCoverage,
    averageLatencyMs: aggregate.averageLatencyMs <= thresholds.maxAverageLatencyMs,
  };

  const passed =
    thresholdStatus.recallAtK &&
    thresholdStatus.meanReciprocalRank &&
    thresholdStatus.passRate &&
    thresholdStatus.citationCoverage &&
    thresholdStatus.averageLatencyMs;

  return {
    cases,
    aggregate,
    thresholds,
    thresholdStatus,
    passed,
  };
}

export function assertSemanticSearchQualityGate(
  summary: SemanticSearchEvaluationSummary,
): void {
  if (summary.passed) return;

  const errors: string[] = [];

  if (!summary.thresholdStatus.recallAtK) {
    errors.push(
      `recallAtK ${summary.aggregate.recallAtK.toFixed(3)} < ${summary.thresholds.minRecallAtK}`,
    );
  }
  if (!summary.thresholdStatus.meanReciprocalRank) {
    errors.push(
      `meanReciprocalRank ${summary.aggregate.meanReciprocalRank.toFixed(3)} < ${summary.thresholds.minMeanReciprocalRank}`,
    );
  }
  if (!summary.thresholdStatus.passRate) {
    errors.push(
      `passRate ${summary.aggregate.passRate.toFixed(3)} < ${summary.thresholds.minPassRate}`,
    );
  }
  if (!summary.thresholdStatus.citationCoverage) {
    errors.push(
      `citationCoverage ${summary.aggregate.citationCoverage.toFixed(3)} < ${summary.thresholds.minCitationCoverage}`,
    );
  }
  if (!summary.thresholdStatus.averageLatencyMs) {
    errors.push(
      `averageLatencyMs ${summary.aggregate.averageLatencyMs.toFixed(1)} > ${summary.thresholds.maxAverageLatencyMs}`,
    );
  }

  throw new Error(`Semantic search quality gate failed: ${errors.join("; ")}`);
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase();
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function computeCitationCoverage(
  output: SemanticSearchEvalRunOutput,
  resultCount: number,
): number {
  if (resultCount === 0) return 1;
  const citationCount = output.citations?.length ?? 0;
  return Math.min(1, citationCount / resultCount);
}
