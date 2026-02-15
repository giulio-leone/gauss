// =============================================================================
// EvalsPlugin — Evaluation metrics collection
// =============================================================================

import type {
  PluginHooks,
  PluginContext,
  BeforeRunParams,
  BeforeRunResult,
  AfterRunParams,
  AfterToolParams,
  OnErrorParams,
} from "../ports/plugin.port.js";
import { BasePlugin } from "./base.plugin.js";
import type { EvalResult, EvalMetrics } from "../domain/eval.schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EvalScorer {
  readonly name: string;
  score(prompt: string, output: string, metrics: EvalMetrics): Promise<number> | number;
}

export interface EvalsPluginOptions {
  /** Custom scoring functions */
  scorers?: EvalScorer[];
  /** Whether to persist results via MemoryPort metadata (default: false) */
  persist?: boolean;
  /** Callback invoked after each evaluation */
  onEval?: (result: EvalResult) => void | Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

interface RunState {
  startTime: number;
  prompt: string;
  toolCallCounts: Record<string, number>;
}

export class EvalsPlugin extends BasePlugin {
  readonly name = "evals";

  private readonly options: EvalsPluginOptions;
  private readonly results: EvalResult[] = [];
  private readonly runStates = new Map<string, RunState>();

  constructor(options: EvalsPluginOptions = {}) {
    super();
    this.options = options;
  }

  protected buildHooks(): PluginHooks {
    return {
      beforeRun: this.beforeRun.bind(this),
      afterRun: this.afterRun.bind(this),
      afterTool: this.afterTool.bind(this),
      onError: this.onError.bind(this),
    };
  }

  private beforeRun(ctx: PluginContext, params: BeforeRunParams): BeforeRunResult | void {
    this.runStates.set(ctx.sessionId, {
      startTime: Date.now(),
      prompt: params.prompt,
      toolCallCounts: {},
    });
  }

  private async afterRun(ctx: PluginContext, params: AfterRunParams): Promise<void> {
    const state = this.runStates.get(ctx.sessionId);
    const latencyMs = state ? Date.now() - state.startTime : 0;
    const prompt = state?.prompt ?? "";
    const toolCalls = state ? { ...state.toolCallCounts } : {};
    this.runStates.delete(ctx.sessionId);

    const steps = params.result.steps;

    // Extract token usage from steps if available
    let promptTokens = 0;
    let completionTokens = 0;
    for (const step of steps) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usage = (step as any)?.usage;
      if (usage) {
        promptTokens += usage.promptTokens ?? 0;
        completionTokens += usage.completionTokens ?? 0;
      }
    }

    const metrics: EvalMetrics = {
      latencyMs,
      stepCount: steps.length,
      toolCalls,
      tokenUsage: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      customScores: {},
    };

    // Run custom scorers
    for (const scorer of this.options.scorers ?? []) {
      try {
        metrics.customScores[scorer.name] = await scorer.score(
          prompt,
          params.result.text,
          metrics,
        );
      } catch {
        metrics.customScores[scorer.name] = -1;
      }
    }

    const evalResult: EvalResult = {
      id: crypto.randomUUID(),
      sessionId: params.result.sessionId,
      prompt,
      output: params.result.text,
      metrics,
      createdAt: Date.now(),
    };

    this.results.push(evalResult);

    // Persist via MemoryPort if configured
    if (this.options.persist) {
      await ctx.memory.saveMetadata(
        ctx.sessionId,
        `eval:${evalResult.id}`,
        evalResult,
      );
    }

    // Invoke callback
    if (this.options.onEval) {
      await this.options.onEval(evalResult);
    }
  }

  private afterTool(ctx: PluginContext, params: AfterToolParams): void {
    const state = this.runStates.get(ctx.sessionId);
    if (state) {
      state.toolCallCounts[params.toolName] = (state.toolCallCounts[params.toolName] ?? 0) + 1;
    }
  }

  private onError(ctx: PluginContext, params: OnErrorParams): void {
    if (params.phase === "run") {
      this.runStates.delete(ctx.sessionId);
    }
  }

  /** Get all collected eval results */
  getResults(): readonly EvalResult[] {
    return this.results;
  }

  /** Get the most recent eval result */
  getLastResult(): EvalResult | undefined {
    return this.results[this.results.length - 1];
  }

  /** Clear collected results */
  clearResults(): void {
    this.results.length = 0;
  }
}

export function createEvalsPlugin(options: EvalsPluginOptions = {}): EvalsPlugin {
  return new EvalsPlugin(options);
}
