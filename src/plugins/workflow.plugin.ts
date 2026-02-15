// =============================================================================
// WorkflowPlugin — Multi-step workflow execution with retry and rollback
// =============================================================================

import type {
  DeepAgentPlugin,
  PluginHooks,
  PluginContext,
  BeforeRunParams,
  BeforeRunResult,
} from "../ports/plugin.port.js";
import type {
  WorkflowStep,
  WorkflowContext,
  WorkflowResult,
  RetryConfig,
} from "../domain/workflow.schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowPluginConfig {
  steps: WorkflowStep[];
  initialContext?: WorkflowContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class WorkflowError extends Error {
  readonly result: WorkflowResult;

  constructor(message: string, result: WorkflowResult) {
    super(message);
    this.name = "WorkflowError";
    this.result = result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export class WorkflowPlugin implements DeepAgentPlugin {
  readonly name = "workflow";
  readonly version = "1.0.0";
  readonly hooks: PluginHooks;

  private readonly steps: WorkflowStep[];
  private readonly initialContext: WorkflowContext;
  private lastResult: WorkflowResult | undefined;

  constructor(config: WorkflowPluginConfig) {
    this.steps = config.steps;
    this.initialContext = config.initialContext ?? {};
    this.hooks = {
      beforeRun: this.beforeRun.bind(this),
    };
  }

  getLastResult(): WorkflowResult | undefined {
    return this.lastResult;
  }

  // ── Hook implementation ─────────────────────────────────────────────────

  private async beforeRun(
    _ctx: PluginContext,
    params: BeforeRunParams,
  ): Promise<BeforeRunResult> {
    const result = await this.executeWorkflow();
    this.lastResult = result;

    if (result.status === "failed") {
      throw new WorkflowError(
        `Workflow failed at step "${result.failedStep}": ${result.error}`,
        result,
      );
    }

    const contextSummary = Object.entries(result.context)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");

    return {
      prompt: `${params.prompt}\n\n--- Workflow Context ---\n${contextSummary}`,
    };
  }

  // ── Workflow engine ─────────────────────────────────────────────────────

  private async executeWorkflow(): Promise<WorkflowResult> {
    const start = Date.now();
    let context = structuredClone(this.initialContext);
    const completedSteps: string[] = [];
    const skippedSteps: string[] = [];

    for (const step of this.steps) {
      if (step.condition && !step.condition(context)) {
        skippedSteps.push(step.id);
        continue;
      }

      try {
        context = await this.executeWithRetry(step, context);
        completedSteps.push(step.id);
      } catch (error) {
        await this.rollback(completedSteps, context);

        return {
          status: "failed",
          context,
          completedSteps,
          skippedSteps,
          failedStep: step.id,
          error: error instanceof Error ? error.message : String(error),
          totalDurationMs: Date.now() - start,
        };
      }
    }

    return {
      status: "completed",
      context,
      completedSteps,
      skippedSteps,
      totalDurationMs: Date.now() - start,
    };
  }

  private async executeWithRetry(
    step: WorkflowStep,
    context: WorkflowContext,
  ): Promise<WorkflowContext> {
    const retry = { ...DEFAULT_RETRY, ...step.retry };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      try {
        return await step.execute(context);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < retry.maxAttempts) {
          const delay =
            retry.backoffMs * Math.pow(retry.backoffMultiplier, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  private async rollback(
    completedStepIds: string[],
    context: WorkflowContext,
  ): Promise<void> {
    for (const stepId of [...completedStepIds].reverse()) {
      const step = this.steps.find((s) => s.id === stepId);
      if (step?.rollback) {
        try {
          await step.rollback(context);
        } catch {
          // Rollback errors are swallowed to ensure all rollbacks are attempted
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createWorkflowPlugin(
  config: WorkflowPluginConfig,
): WorkflowPlugin {
  return new WorkflowPlugin(config);
}
