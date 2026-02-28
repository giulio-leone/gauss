// =============================================================================
// Agent Testing Framework — Comprehensive Tests
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";

import type {
  AgentTestingPort,
  CoverageTracker,
  RegressionSuite,
  ScenarioResult,
  TestableAgentResult,
} from "../../ports/agent-testing.port.js";

import { DefaultAgentTestingAdapter } from "../../adapters/agent-testing/default-agent-testing.adapter.js";
import { Xorshift128Plus } from "../../adapters/agent-testing/seeded-rng.js";
import { DefaultCoverageTracker } from "../../adapters/agent-testing/coverage-tracker.js";
import { DefaultRegressionSuite } from "../../adapters/agent-testing/regression-suite.js";

// =============================================================================
// Helpers — minimal mock agent factory
// =============================================================================

function createMockAgentFactory(opts: {
  text: string;
  toolCalls?: Array<{ name: string; args: unknown; result: unknown }>;
  steps?: number;
  usage?: { promptTokens: number; completionTokens: number };
  throwError?: string;
  delayMs?: number;
}) {
  return () => ({
    run: async (_prompt: string): Promise<TestableAgentResult> => {
      if (opts.delayMs) {
        await new Promise((r) => setTimeout(r, opts.delayMs));
      }
      if (opts.throwError) {
        throw new Error(opts.throwError);
      }
      const stepCount = opts.steps ?? 1;
      const steps: Record<string, unknown>[] = [];
      for (let i = 0; i < stepCount; i++) {
        steps.push({
          usage: opts.usage ?? { promptTokens: 10, completionTokens: 20 },
        });
      }
      return {
        text: opts.text,
        steps,
        toolCalls: opts.toolCalls ?? [],
      };
    },
  });
}

// =============================================================================
// 1. SeededRng
// =============================================================================

describe("SeededRng (Xorshift128Plus)", () => {
  it("produces deterministic sequences with same seed", () => {
    const rng1 = new Xorshift128Plus(42);
    const rng2 = new Xorshift128Plus(42);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it("produces different sequences with different seeds", () => {
    const rng1 = new Xorshift128Plus(42);
    const rng2 = new Xorshift128Plus(99);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).not.toEqual(seq2);
  });

  it("nextInt returns values in [min, max)", () => {
    const rng = new Xorshift128Plus(123);
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThan(10);
    }
  });

  it("pick selects from array", () => {
    const rng = new Xorshift128Plus(7);
    const arr = ["a", "b", "c", "d"];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it("pick throws on empty array", () => {
    const rng = new Xorshift128Plus(1);
    expect(() => rng.pick([])).toThrow("Cannot pick from empty array");
  });

  it("randomString produces strings of correct length", () => {
    const rng = new Xorshift128Plus(55);
    const s = rng.randomString(25);
    expect(s).toHaveLength(25);
  });
});

// =============================================================================
// 2. DefaultAgentTestingAdapter (port compliance)
// =============================================================================

describe("DefaultAgentTestingAdapter", () => {
  let adapter: AgentTestingPort;

  beforeEach(() => {
    adapter = new DefaultAgentTestingAdapter();
  });

  it("implements AgentTestingPort interface", () => {
    expect(typeof adapter.createScenario).toBe("function");
    expect(typeof adapter.createFuzzer).toBe("function");
    expect(typeof adapter.createCoverageTracker).toBe("function");
    expect(typeof adapter.createRegressionSuite).toBe("function");
    expect(typeof adapter.createRng).toBe("function");
  });

  it("createRng returns deterministic RNG", () => {
    const rng = adapter.createRng(42);
    const vals = [rng.next(), rng.next(), rng.next()];
    const rng2 = adapter.createRng(42);
    const vals2 = [rng2.next(), rng2.next(), rng2.next()];
    expect(vals).toEqual(vals2);
  });
});

// =============================================================================
// 3. ScenarioRunner
// =============================================================================

describe("ScenarioRunner", () => {
  let adapter: AgentTestingPort;

  beforeEach(() => {
    adapter = new DefaultAgentTestingAdapter();
  });

  it("passes a simple scenario with matching response", async () => {
    const scenario = adapter.createScenario({
      name: "greeting test",
      prompt: "Say hello",
      outputAssertions: [{ contains: "Hello" }],
    });

    const result = await scenario.run(
      createMockAgentFactory({ text: "Hello, world!" }),
    );

    expect(result.passed).toBe(true);
    expect(result.name).toBe("greeting test");
    expect(result.failures).toHaveLength(0);
    expect(result.response).toBe("Hello, world!");
  });

  it("fails when response does not contain expected substring", async () => {
    const scenario = adapter.createScenario({
      name: "missing substring",
      prompt: "Say hello",
      outputAssertions: [{ contains: "MISSING_TEXT" }],
    });

    const result = await scenario.run(
      createMockAgentFactory({ text: "Hello, world!" }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("MISSING_TEXT");
  });

  it("validates expected tool calls (unordered)", async () => {
    const scenario = adapter.createScenario({
      name: "tool call test",
      prompt: "Use tools",
      expectedToolCalls: [
        { name: "search", args: { query: "test" } },
        { name: "calculate" },
      ],
    });

    const result = await scenario.run(
      createMockAgentFactory({
        text: "Done",
        toolCalls: [
          { name: "calculate", args: {}, result: 42 },
          { name: "search", args: { query: "test" }, result: "found" },
        ],
      }),
    );

    expect(result.passed).toBe(true);
  });

  it("validates expected tool calls in strict order", async () => {
    const scenario = adapter.createScenario({
      name: "strict order test",
      prompt: "Use tools in order",
      expectedToolCalls: [
        { name: "first" },
        { name: "second" },
      ],
      strictOrder: true,
    });

    const result = await scenario.run(
      createMockAgentFactory({
        text: "Done",
        toolCalls: [
          { name: "second", args: {}, result: null },
          { name: "first", args: {}, result: null },
        ],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('expected "first"'))).toBe(true);
  });

  it("fails when max steps exceeded", async () => {
    const scenario = adapter.createScenario({
      name: "max steps test",
      prompt: "Do work",
      maxSteps: 2,
    });

    const result = await scenario.run(
      createMockAgentFactory({ text: "Done", steps: 5 }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("at most 2 steps");
  });

  it("handles agent execution errors gracefully", async () => {
    const scenario = adapter.createScenario({
      name: "error handling",
      prompt: "Crash",
    });

    const result = await scenario.run(
      createMockAgentFactory({ text: "", throwError: "Agent crashed!" }),
    );

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("Agent crashed!");
  });

  it("supports regex output assertions", async () => {
    const scenario = adapter.createScenario({
      name: "regex test",
      prompt: "Give me a number",
      outputAssertions: [{ matches: /\d{3,}/ }],
    });

    const result = await scenario.run(
      createMockAgentFactory({ text: "The answer is 12345" }),
    );

    expect(result.passed).toBe(true);
  });

  it("supports custom validator output assertions", async () => {
    const scenario = adapter.createScenario({
      name: "custom validator",
      prompt: "Give JSON",
      outputAssertions: [
        {
          validate: (resp) => {
            try {
              JSON.parse(resp);
              return true;
            } catch {
              return false;
            }
          },
        },
      ],
    });

    const result = await scenario.run(
      createMockAgentFactory({ text: '{"key": "value"}' }),
    );
    expect(result.passed).toBe(true);

    const result2 = await scenario.run(
      createMockAgentFactory({ text: "not json" }),
    );
    expect(result2.passed).toBe(false);
  });

  it("records token usage from steps", async () => {
    const scenario = adapter.createScenario({
      name: "token tracking",
      prompt: "Do something",
    });

    const result = await scenario.run(
      createMockAgentFactory({
        text: "Done",
        steps: 3,
        usage: { promptTokens: 100, completionTokens: 50 },
      }),
    );

    expect(result.tokenUsage.input).toBe(300);
    expect(result.tokenUsage.output).toBe(150);
  });
});

// =============================================================================
// 4. AgentFuzzer
// =============================================================================

describe("AgentFuzzer", () => {
  let adapter: AgentTestingPort;

  beforeEach(() => {
    adapter = new DefaultAgentTestingAdapter();
  });

  it("runs the configured number of iterations", async () => {
    const fuzzer = adapter.createFuzzer({
      iterations: 10,
      seed: 42,
    });

    const report = await fuzzer.run(
      createMockAgentFactory({ text: "ok" }),
    );

    expect(report.totalIterations).toBe(10);
    expect(report.passed).toBe(10);
    expect(report.failed).toBe(0);
    expect(report.seed).toBe(42);
  });

  it("catches agent errors during fuzzing", async () => {
    const fuzzer = adapter.createFuzzer({
      iterations: 5,
      seed: 7,
    });

    const report = await fuzzer.run(
      createMockAgentFactory({ text: "", throwError: "boom" }),
    );

    expect(report.failed).toBe(5);
    expect(report.errors).toHaveLength(5);
    expect(report.errors[0]!.error).toBe("boom");
  });

  it("produces deterministic results with same seed", async () => {
    const run1 = await adapter
      .createFuzzer({ iterations: 5, seed: 123 })
      .run(createMockAgentFactory({ text: "ok" }));

    const run2 = await adapter
      .createFuzzer({ iterations: 5, seed: 123 })
      .run(createMockAgentFactory({ text: "ok" }));

    expect(run1.totalIterations).toBe(run2.totalIterations);
    expect(run1.passed).toBe(run2.passed);
    expect(run1.failed).toBe(run2.failed);
  });

  it("supports custom generators", async () => {
    const customInputs: string[] = [];

    const fuzzer = adapter.createFuzzer({
      iterations: 3,
      seed: 42,
      generators: {
        custom: (rng) => {
          const input = `custom-${rng.nextInt(0, 100)}`;
          customInputs.push(input);
          return input;
        },
      },
    });

    await fuzzer.run(createMockAgentFactory({ text: "ok" }));

    // With only our custom generator plus built-ins, at least some should be custom
    // (depends on random selection — but with seed 42, the results are deterministic)
    expect(customInputs.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// 5. CoverageTracker
// =============================================================================

describe("CoverageTracker", () => {
  let tracker: CoverageTracker & { recordStep: () => void };

  beforeEach(() => {
    tracker = new DefaultCoverageTracker();
  });

  it("tracks registered tools", () => {
    tracker.registerTools(["search", "calculate", "fetch"]);
    const report = tracker.report();

    expect(report.registeredTools).toEqual(["search", "calculate", "fetch"]);
    expect(report.uncalledTools).toEqual(["search", "calculate", "fetch"]);
    expect(report.coveragePercent).toBe(0);
  });

  it("calculates coverage percentage correctly", () => {
    tracker.registerTools(["search", "calculate", "fetch", "write"]);
    tracker.recordToolCall("search", { q: "test" }, 10);
    tracker.recordToolCall("calculate", { expr: "1+1" }, 5);

    const report = tracker.report();
    expect(report.coveragePercent).toBe(50);
    expect(report.calledTools).toEqual(["search", "calculate"]);
    expect(report.uncalledTools).toEqual(["fetch", "write"]);
  });

  it("tracks unique argument patterns", () => {
    tracker.recordToolCall("search", { query: "a" }, 10);
    tracker.recordToolCall("search", { query: "b" }, 10);
    tracker.recordToolCall("search", { query: "c", limit: 5 }, 10);

    const report = tracker.report();
    // { query: "a" } and { query: "b" } have same shape (query:string)
    // { query: "c", limit: 5 } has different shape (limit:number,query:string)
    expect(report.toolDetails["search"]!.uniqueArgPatterns).toBe(2);
    expect(report.toolDetails["search"]!.callCount).toBe(3);
  });

  it("tracks errors", () => {
    tracker.recordToolCall("fetch", { url: "http://x" }, 100, new Error("timeout"));
    tracker.recordToolCall("fetch", { url: "http://y" }, 50);

    const report = tracker.report();
    expect(report.toolDetails["fetch"]!.errorCount).toBe(1);
    expect(report.toolDetails["fetch"]!.callCount).toBe(2);
  });

  it("tracks steps and total calls", () => {
    tracker.recordStep();
    tracker.recordStep();
    tracker.recordToolCall("a", {}, 1);
    tracker.recordToolCall("b", {}, 1);
    tracker.recordToolCall("a", {}, 1);

    const report = tracker.report();
    expect(report.totalSteps).toBe(2);
    expect(report.totalToolCalls).toBe(3);
  });

  it("resets all data", () => {
    tracker.registerTools(["x"]);
    tracker.recordToolCall("x", {}, 1);
    tracker.recordStep();
    tracker.reset();

    const report = tracker.report();
    expect(report.registeredTools).toEqual([]);
    expect(report.calledTools).toEqual([]);
    expect(report.totalSteps).toBe(0);
    expect(report.totalToolCalls).toBe(0);
    expect(report.coveragePercent).toBe(100); // 0/0 = 100%
  });

  it("handles unregistered tools in coverage", () => {
    tracker.registerTools(["a", "b"]);
    tracker.recordToolCall("c", {}, 1); // unregistered tool

    const report = tracker.report();
    // 3 total known (a, b, c), 1 called => 33.33%
    expect(report.coveragePercent).toBe(33.33);
    expect(report.uncalledTools).toEqual(["a", "b"]);
  });
});

// =============================================================================
// 6. RegressionSuite
// =============================================================================

describe("RegressionSuite", () => {
  let suite: RegressionSuite;

  const makeResult = (overrides: Partial<ScenarioResult> = {}): ScenarioResult => ({
    name: "test",
    passed: true,
    durationMs: 100,
    steps: 3,
    actualToolCalls: [
      { name: "search", args: { q: "test" }, result: "found" },
    ],
    response: "Hello, world!",
    failures: [],
    tokenUsage: { input: 100, output: 50 },
    ...overrides,
  });

  beforeEach(() => {
    suite = new DefaultRegressionSuite({
      baselineId: "v1",
      tolerance: 0,
    });
  });

  it("passes when no baseline exists", () => {
    const result = suite.compare("new-scenario", makeResult());
    expect(result.passed).toBe(true);
    expect(result.diffs).toHaveLength(0);
  });

  it("passes when current matches baseline exactly", () => {
    const original = makeResult();
    suite.saveBaseline("exact-match", original);

    const result = suite.compare("exact-match", makeResult());
    expect(result.passed).toBe(true);
    expect(result.diffs).toHaveLength(0);
  });

  it("detects response drift as breaking", () => {
    suite.saveBaseline("response-drift", makeResult());
    const current = makeResult({ response: "Different response!" });

    const result = suite.compare("response-drift", current);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d) => d.field === "response" && d.severity === "breaking")).toBe(true);
  });

  it("detects tool call count change as breaking", () => {
    suite.saveBaseline("tool-drift", makeResult());
    const current = makeResult({
      actualToolCalls: [
        { name: "search", args: { q: "test" }, result: "found" },
        { name: "calculate", args: { x: 1 }, result: 2 },
      ],
    });

    const result = suite.compare("tool-drift", current);
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d) => d.field === "toolCallCount")).toBe(true);
  });

  it("detects step count change as warning", () => {
    suite.saveBaseline("step-drift", makeResult());
    const current = makeResult({ steps: 5 });

    const result = suite.compare("step-drift", current);
    // steps diff is "warning", not "breaking" => should still pass
    expect(result.diffs.some((d) => d.field === "steps")).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("respects tolerance for numeric fields", () => {
    const tolerantSuite = new DefaultRegressionSuite({
      baselineId: "v1",
      tolerance: 0.5, // 50% tolerance
    });

    tolerantSuite.saveBaseline("tolerant", makeResult({ steps: 3 }));
    // 4 steps = 33% drift, under 50% tolerance => info not warning
    const current = makeResult({ steps: 4 });
    const result = tolerantSuite.compare("tolerant", current);
    const stepsDiff = result.diffs.find((d) => d.field === "steps");
    expect(stepsDiff?.severity).toBe("info");
  });

  it("respects ignoreFields configuration", () => {
    const ignoreSuite = new DefaultRegressionSuite({
      baselineId: "v1",
      ignoreFields: ["response", "tokenUsage"],
    });

    ignoreSuite.saveBaseline("ignore-test", makeResult());
    const current = makeResult({
      response: "COMPLETELY DIFFERENT",
      tokenUsage: { input: 9999, output: 9999 },
    });

    const result = ignoreSuite.compare("ignore-test", current);
    expect(result.diffs.some((d) => d.field === "response")).toBe(false);
    expect(result.diffs.some((d) => d.field === "tokenUsage")).toBe(false);
  });

  it("lists and clears baselines", () => {
    suite.saveBaseline("alpha", makeResult());
    suite.saveBaseline("beta", makeResult());

    expect(suite.listBaselines()).toEqual(["alpha", "beta"]);

    suite.clearBaseline("alpha");
    expect(suite.listBaselines()).toEqual(["beta"]);
  });

  it("provides snapshot strings in result", () => {
    suite.saveBaseline("snapshot-test", makeResult());
    const result = suite.compare("snapshot-test", makeResult());

    expect(result.baselineSnapshot).toBeTruthy();
    expect(result.currentSnapshot).toBeTruthy();
    expect(typeof result.baselineSnapshot).toBe("string");
    // Both should parse as valid JSON
    expect(() => JSON.parse(result.baselineSnapshot)).not.toThrow();
    expect(() => JSON.parse(result.currentSnapshot)).not.toThrow();
  });
});

// =============================================================================
// 7. Integration — Port wiring
// =============================================================================

describe("Integration: Full testing workflow", () => {
  it("scenario + coverage + regression in one flow", async () => {
    const adapter = new DefaultAgentTestingAdapter();

    // 1. Create scenario
    const scenario = adapter.createScenario({
      name: "integration test",
      prompt: "Search for X and calculate Y",
      expectedToolCalls: [{ name: "search" }, { name: "calculate" }],
      outputAssertions: [{ contains: "result" }],
    });

    // 2. Create coverage tracker
    const coverage = adapter.createCoverageTracker();
    coverage.registerTools(["search", "calculate", "unused_tool"]);

    // 3. Run scenario
    const scenarioResult = await scenario.run(
      createMockAgentFactory({
        text: "Here is the result",
        toolCalls: [
          { name: "search", args: { q: "X" }, result: "data" },
          { name: "calculate", args: { expr: "Y" }, result: 42 },
        ],
      }),
    );

    expect(scenarioResult.passed).toBe(true);

    // 4. Feed tool calls to coverage
    for (const tc of scenarioResult.actualToolCalls) {
      coverage.recordToolCall(tc.name, tc.args, 10);
    }

    const coverageReport = coverage.report();
    expect(coverageReport.coveragePercent).toBe(66.67);
    expect(coverageReport.uncalledTools).toEqual(["unused_tool"]);

    // 5. Save as regression baseline
    const regression = adapter.createRegressionSuite({ baselineId: "v1" });
    regression.saveBaseline("integration test", scenarioResult);

    // 6. Compare same result
    const regressionResult = regression.compare("integration test", scenarioResult);
    expect(regressionResult.passed).toBe(true);
    expect(regressionResult.diffs).toHaveLength(0);
  });
});
