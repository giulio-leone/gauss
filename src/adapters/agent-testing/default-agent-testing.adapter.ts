// =============================================================================
// DefaultAgentTestingAdapter — Full implementation of AgentTestingPort
// =============================================================================

import type {
  AgentTestingPort,
  ScenarioConfig,
  TestScenarioRunner,
  FuzzerConfig,
  AgentFuzzerRunner,
  CoverageTracker,
  RegressionConfig,
  RegressionSuite,
  SeededRng,
} from "../../ports/agent-testing.port.js";

import { DefaultScenarioRunner } from "./scenario-runner.js";
import { DefaultAgentFuzzer } from "./agent-fuzzer.js";
import { DefaultCoverageTracker } from "./coverage-tracker.js";
import { DefaultRegressionSuite } from "./regression-suite.js";
import { Xorshift128Plus } from "./seeded-rng.js";

export class DefaultAgentTestingAdapter implements AgentTestingPort {
  createScenario(config: ScenarioConfig): TestScenarioRunner {
    return new DefaultScenarioRunner(config);
  }

  createFuzzer(config: FuzzerConfig): AgentFuzzerRunner {
    return new DefaultAgentFuzzer(config);
  }

  createCoverageTracker(): CoverageTracker {
    return new DefaultCoverageTracker();
  }

  createRegressionSuite(config: RegressionConfig): RegressionSuite {
    return new DefaultRegressionSuite(config);
  }

  createRng(seed: number): SeededRng {
    return new Xorshift128Plus(seed);
  }
}
