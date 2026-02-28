// =============================================================================
// RegressionSuite — Compare test results across runs
// =============================================================================

import type {
  RegressionConfig,
  RegressionSuite,
  RegressionResult,
  RegressionDiff,
  ScenarioResult,
} from "../../ports/agent-testing.port.js";

/** Serializable baseline data */
interface BaselineEntry {
  response: string;
  steps: number;
  toolCallNames: string[];
  toolCallCount: number;
  tokenUsage: { input: number; output: number };
  snapshot: string;
}

export class DefaultRegressionSuite implements RegressionSuite {
  private readonly config: RegressionConfig;
  private readonly baselines: Map<string, BaselineEntry> = new Map();

  constructor(config: RegressionConfig) {
    this.config = config;
  }

  saveBaseline(scenarioName: string, result: ScenarioResult): void {
    const entry: BaselineEntry = {
      response: result.response,
      steps: result.steps,
      toolCallNames: result.actualToolCalls.map((tc) => tc.name),
      toolCallCount: result.actualToolCalls.length,
      tokenUsage: { ...result.tokenUsage },
      snapshot: this.createSnapshot(result),
    };
    this.baselines.set(this.key(scenarioName), entry);
  }

  compare(scenarioName: string, current: ScenarioResult): RegressionResult {
    const key = this.key(scenarioName);
    const baseline = this.baselines.get(key);

    if (!baseline) {
      return {
        baselineId: this.config.baselineId,
        passed: true,
        diffs: [],
        baselineSnapshot: "",
        currentSnapshot: this.createSnapshot(current),
      };
    }

    const diffs: RegressionDiff[] = [];
    const ignoreSet = new Set(this.config.ignoreFields ?? []);
    const tolerance = this.config.tolerance ?? 0;

    // Compare response
    if (!ignoreSet.has("response") && baseline.response !== current.response) {
      diffs.push({
        field: "response",
        expected: baseline.response,
        actual: current.response,
        severity: "breaking",
      });
    }

    // Compare steps
    if (!ignoreSet.has("steps") && baseline.steps !== current.steps) {
      const drift =
        baseline.steps === 0
          ? current.steps > 0
            ? 1
            : 0
          : Math.abs(current.steps - baseline.steps) / baseline.steps;
      diffs.push({
        field: "steps",
        expected: baseline.steps,
        actual: current.steps,
        severity: drift > tolerance ? "warning" : "info",
      });
    }

    // Compare tool call count
    if (
      !ignoreSet.has("toolCallCount") &&
      baseline.toolCallCount !== current.actualToolCalls.length
    ) {
      diffs.push({
        field: "toolCallCount",
        expected: baseline.toolCallCount,
        actual: current.actualToolCalls.length,
        severity: "breaking",
      });
    }

    // Compare tool call names (order-independent)
    if (!ignoreSet.has("toolCallNames")) {
      const baselineNames = [...baseline.toolCallNames].sort();
      const currentNames = [...current.actualToolCalls.map((tc) => tc.name)].sort();
      if (JSON.stringify(baselineNames) !== JSON.stringify(currentNames)) {
        diffs.push({
          field: "toolCallNames",
          expected: baselineNames,
          actual: currentNames,
          severity: "breaking",
        });
      }
    }

    // Compare token usage with tolerance
    if (!ignoreSet.has("tokenUsage")) {
      const inputDrift =
        baseline.tokenUsage.input === 0
          ? current.tokenUsage.input > 0
            ? 1
            : 0
          : Math.abs(current.tokenUsage.input - baseline.tokenUsage.input) /
            baseline.tokenUsage.input;
      const outputDrift =
        baseline.tokenUsage.output === 0
          ? current.tokenUsage.output > 0
            ? 1
            : 0
          : Math.abs(current.tokenUsage.output - baseline.tokenUsage.output) /
            baseline.tokenUsage.output;

      if (inputDrift > tolerance || outputDrift > tolerance) {
        diffs.push({
          field: "tokenUsage",
          expected: baseline.tokenUsage,
          actual: current.tokenUsage,
          severity: "warning",
        });
      }
    }

    const hasBreaking = diffs.some((d) => d.severity === "breaking");

    return {
      baselineId: this.config.baselineId,
      passed: !hasBreaking,
      diffs,
      baselineSnapshot: baseline.snapshot,
      currentSnapshot: this.createSnapshot(current),
    };
  }

  listBaselines(): readonly string[] {
    const prefix = `${this.config.baselineId}::`;
    return [...this.baselines.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  clearBaseline(scenarioName: string): void {
    this.baselines.delete(this.key(scenarioName));
  }

  private key(scenarioName: string): string {
    return `${this.config.baselineId}::${scenarioName}`;
  }

  private createSnapshot(result: ScenarioResult): string {
    return JSON.stringify(
      {
        response: result.response,
        steps: result.steps,
        toolCalls: result.actualToolCalls.map((tc) => ({
          name: tc.name,
          args: tc.args,
        })),
        tokenUsage: result.tokenUsage,
      },
      null,
      2,
    );
  }
}
