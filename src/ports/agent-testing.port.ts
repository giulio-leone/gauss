// =============================================================================
// AgentTestingPort — Contract for advanced agent testing framework
// =============================================================================

// =============================================================================
// Scenario-Based Testing
// =============================================================================

/** A single expected tool invocation within a scenario */
export interface ExpectedToolCall {
  /** Tool name to expect */
  readonly name: string;
  /** Optional: expected arguments (deep equality) */
  readonly args?: Record<string, unknown>;
  /** Optional: expected result from the tool */
  readonly result?: unknown;
}

/** Assertion on the final agent output */
export interface OutputAssertion {
  /** Substring that must appear in the response */
  readonly contains?: string;
  /** Regex pattern the response must match */
  readonly matches?: RegExp;
  /** Custom validator function */
  readonly validate?: (response: string) => boolean;
}

/** Configuration for a single test scenario */
export interface ScenarioConfig {
  /** Human-readable scenario name */
  readonly name: string;
  /** The user prompt to send to the agent */
  readonly prompt: string;
  /** Expected tool calls in order (if strict) or any order */
  readonly expectedToolCalls?: readonly ExpectedToolCall[];
  /** Whether tool call order must match exactly */
  readonly strictOrder?: boolean;
  /** Assertions on the final output */
  readonly outputAssertions?: readonly OutputAssertion[];
  /** Maximum allowed steps */
  readonly maxSteps?: number;
  /** Maximum allowed duration in ms */
  readonly maxDurationMs?: number;
  /** Tags for filtering scenarios */
  readonly tags?: readonly string[];
}

/** Result of a single scenario execution */
export interface ScenarioResult {
  readonly name: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly steps: number;
  readonly actualToolCalls: ReadonlyArray<{
    name: string;
    args: unknown;
    result: unknown;
  }>;
  readonly response: string;
  readonly failures: readonly string[];
  readonly tokenUsage: { readonly input: number; readonly output: number };
}

// =============================================================================
// Fuzzing
// =============================================================================

/** Configuration for the fuzzer */
export interface FuzzerConfig {
  /** Number of fuzz iterations */
  readonly iterations: number;
  /** Seed for reproducible randomness */
  readonly seed?: number;
  /** Custom input generators (by name) */
  readonly generators?: Readonly<Record<string, InputGenerator>>;
  /** Maximum duration per fuzz iteration in ms */
  readonly maxIterationMs?: number;
  /** Tags for filtering fuzz results */
  readonly tags?: readonly string[];
}

/** A function that generates random input strings */
export type InputGenerator = (rng: SeededRng) => string;

/** Seeded random number generator interface */
export interface SeededRng {
  /** Returns a float in [0, 1) */
  next(): number;
  /** Returns an integer in [min, max) */
  nextInt(min: number, max: number): number;
  /** Picks a random element from an array */
  pick<T>(arr: readonly T[]): T;
  /** Returns a random string of given length */
  randomString(length: number): string;
}

/** Result of a single fuzz iteration */
export interface FuzzIterationResult {
  readonly input: string;
  readonly generatorName: string;
  readonly passed: boolean;
  readonly error?: string;
  readonly durationMs: number;
  readonly steps: number;
}

/** Aggregated fuzz results */
export interface FuzzReport {
  readonly totalIterations: number;
  readonly passed: number;
  readonly failed: number;
  readonly errors: ReadonlyArray<{
    input: string;
    error: string;
    generatorName: string;
  }>;
  readonly durationMs: number;
  readonly seed: number;
}

// =============================================================================
// Coverage Tracking
// =============================================================================

/** Coverage data for a tool */
export interface ToolCoverageEntry {
  readonly toolName: string;
  readonly callCount: number;
  readonly uniqueArgPatterns: number;
  readonly errorCount: number;
  readonly totalDurationMs: number;
}

/** Coverage report */
export interface CoverageReport {
  readonly registeredTools: readonly string[];
  readonly calledTools: readonly string[];
  readonly uncalledTools: readonly string[];
  readonly coveragePercent: number;
  readonly toolDetails: Readonly<Record<string, ToolCoverageEntry>>;
  readonly totalSteps: number;
  readonly totalToolCalls: number;
}

// =============================================================================
// Regression Testing
// =============================================================================

/** Configuration for regression testing */
export interface RegressionConfig {
  /** Identifier for this regression baseline */
  readonly baselineId: string;
  /** Tolerance for numeric drift (0-1). Default: 0 (exact) */
  readonly tolerance?: number;
  /** Fields to ignore when comparing */
  readonly ignoreFields?: readonly string[];
}

/** A single regression diff */
export interface RegressionDiff {
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly severity: "breaking" | "warning" | "info";
}

/** Result of a regression comparison */
export interface RegressionResult {
  readonly baselineId: string;
  readonly passed: boolean;
  readonly diffs: readonly RegressionDiff[];
  readonly baselineSnapshot: string;
  readonly currentSnapshot: string;
}

// =============================================================================
// Latency Simulation
// =============================================================================

/** Configuration for latency simulation */
export interface LatencyProfile {
  /** Base latency in ms */
  readonly baseMs: number;
  /** Random jitter range in ms */
  readonly jitterMs?: number;
  /** Probability of a timeout (0-1) */
  readonly timeoutRate?: number;
  /** Probability of an error (0-1) */
  readonly errorRate?: number;
}

// =============================================================================
// Port Interface
// =============================================================================

export interface TestScenarioRunner {
  run(
    agentFactory: () => { run: (prompt: string) => Promise<TestableAgentResult> },
  ): Promise<ScenarioResult>;
}

export interface TestableAgentResult {
  readonly text: string;
  readonly steps: readonly Record<string, unknown>[];
  readonly toolCalls?: ReadonlyArray<{
    name: string;
    args: unknown;
    result: unknown;
  }>;
}

export interface AgentFuzzerRunner {
  run(
    agentFactory: () => { run: (prompt: string) => Promise<TestableAgentResult> },
  ): Promise<FuzzReport>;
}

export interface CoverageTracker {
  /** Record a tool call event */
  recordToolCall(
    toolName: string,
    args: unknown,
    durationMs: number,
    error?: Error,
  ): void;
  /** Register known tools for coverage calculation */
  registerTools(toolNames: readonly string[]): void;
  /** Generate coverage report */
  report(): CoverageReport;
  /** Reset all tracking data */
  reset(): void;
}

export interface RegressionSuite {
  /** Save current result as a baseline */
  saveBaseline(scenarioName: string, result: ScenarioResult): void;
  /** Compare current result against saved baseline */
  compare(scenarioName: string, current: ScenarioResult): RegressionResult;
  /** Get all saved baselines */
  listBaselines(): readonly string[];
  /** Clear a specific baseline */
  clearBaseline(scenarioName: string): void;
}

/** Main port interface for the agent testing framework */
export interface AgentTestingPort {
  /** Create a scenario runner from config */
  createScenario(config: ScenarioConfig): TestScenarioRunner;
  /** Create a fuzzer from config */
  createFuzzer(config: FuzzerConfig): AgentFuzzerRunner;
  /** Create a coverage tracker */
  createCoverageTracker(): CoverageTracker;
  /** Create a regression suite */
  createRegressionSuite(config: RegressionConfig): RegressionSuite;
  /** Create a seeded RNG */
  createRng(seed: number): SeededRng;
}
