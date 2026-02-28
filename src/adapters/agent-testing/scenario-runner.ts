// =============================================================================
// ScenarioRunner — Execute a test scenario against an agent
// =============================================================================

import type {
  ScenarioConfig,
  ScenarioResult,
  TestScenarioRunner,
  TestableAgentResult,
  ExpectedToolCall,
} from "../../ports/agent-testing.port.js";

export class DefaultScenarioRunner implements TestScenarioRunner {
  constructor(private readonly config: ScenarioConfig) {}

  async run(
    agentFactory: () => {
      run: (prompt: string) => Promise<TestableAgentResult>;
    },
  ): Promise<ScenarioResult> {
    const failures: string[] = [];
    const start = Date.now();
    let response = "";
    let steps = 0;
    let actualToolCalls: ScenarioResult["actualToolCalls"] = [];
    let tokenInput = 0;
    let tokenOutput = 0;

    try {
      const agent = agentFactory();

      // Apply timeout if configured
      const runPromise = agent.run(this.config.prompt);
      let result: TestableAgentResult;

      if (this.config.maxDurationMs) {
        result = await Promise.race([
          runPromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Scenario "${this.config.name}" exceeded timeout of ${this.config.maxDurationMs}ms`)),
              this.config.maxDurationMs,
            ),
          ),
        ]);
      } else {
        result = await runPromise;
      }

      response = result.text;
      steps = result.steps.length;

      // Extract tool calls
      if (result.toolCalls) {
        actualToolCalls = result.toolCalls.map((tc) => ({
          name: tc.name,
          args: tc.args,
          result: tc.result,
        }));
      } else {
        actualToolCalls = this.extractToolCallsFromSteps(result.steps);
      }

      // Extract token usage
      for (const step of result.steps) {
        const usage = step.usage as
          | { promptTokens?: number; completionTokens?: number }
          | undefined;
        if (usage) {
          tokenInput += usage.promptTokens ?? 0;
          tokenOutput += usage.completionTokens ?? 0;
        }
      }
    } catch (err) {
      failures.push(`Execution error: ${(err as Error).message}`);
    }

    const durationMs = Date.now() - start;

    // Validate max steps
    if (this.config.maxSteps !== undefined && steps > this.config.maxSteps) {
      failures.push(
        `Expected at most ${this.config.maxSteps} steps, got ${steps}`,
      );
    }

    // Validate tool calls
    if (this.config.expectedToolCalls) {
      this.validateToolCalls(
        this.config.expectedToolCalls,
        actualToolCalls,
        this.config.strictOrder ?? false,
        failures,
      );
    }

    // Validate output assertions
    if (this.config.outputAssertions) {
      for (const assertion of this.config.outputAssertions) {
        if (
          assertion.contains !== undefined &&
          !response.includes(assertion.contains)
        ) {
          failures.push(
            `Response does not contain "${assertion.contains}"`,
          );
        }
        if (assertion.matches !== undefined && !assertion.matches.test(response)) {
          failures.push(
            `Response does not match pattern ${assertion.matches}`,
          );
        }
        if (assertion.validate !== undefined && !assertion.validate(response)) {
          failures.push(`Custom output validation failed`);
        }
      }
    }

    return {
      name: this.config.name,
      passed: failures.length === 0,
      durationMs,
      steps,
      actualToolCalls,
      response,
      failures,
      tokenUsage: { input: tokenInput, output: tokenOutput },
    };
  }

  private validateToolCalls(
    expected: readonly ExpectedToolCall[],
    actual: ScenarioResult["actualToolCalls"],
    strictOrder: boolean,
    failures: string[],
  ): void {
    if (strictOrder) {
      for (let i = 0; i < expected.length; i++) {
        const exp = expected[i]!;
        const act = actual[i];
        if (!act) {
          failures.push(
            `Expected tool call #${i} "${exp.name}" but only ${actual.length} calls were made`,
          );
          continue;
        }
        if (act.name !== exp.name) {
          failures.push(
            `Tool call #${i}: expected "${exp.name}", got "${act.name}"`,
          );
        }
        if (
          exp.args !== undefined &&
          JSON.stringify(act.args) !== JSON.stringify(exp.args)
        ) {
          failures.push(
            `Tool call #${i} "${exp.name}": args mismatch. Expected ${JSON.stringify(exp.args)}, got ${JSON.stringify(act.args)}`,
          );
        }
      }
    } else {
      for (const exp of expected) {
        const match = actual.find((a) => {
          if (a.name !== exp.name) return false;
          if (
            exp.args !== undefined &&
            JSON.stringify(a.args) !== JSON.stringify(exp.args)
          ) {
            return false;
          }
          return true;
        });
        if (!match) {
          failures.push(
            `Expected tool "${exp.name}" to be called${exp.args ? ` with ${JSON.stringify(exp.args)}` : ""}, but it was not`,
          );
        }
      }
    }
  }

  private extractToolCallsFromSteps(
    steps: readonly Record<string, unknown>[],
  ): ScenarioResult["actualToolCalls"][number][] {
    const calls: ScenarioResult["actualToolCalls"][number][] = [];
    for (const step of steps) {
      const toolCalls = step.toolCalls as
        | Array<Record<string, unknown>>
        | undefined;
      const toolResults = step.toolResults as
        | Array<Record<string, unknown>>
        | undefined;
      if (toolCalls) {
        for (let i = 0; i < toolCalls.length; i++) {
          const call = toolCalls[i]!;
          const result = toolResults?.[i];
          calls.push({
            name: call.toolName as string,
            args: call.args,
            result: result?.result ?? undefined,
          });
        }
      }
    }
    return calls;
  }
}
