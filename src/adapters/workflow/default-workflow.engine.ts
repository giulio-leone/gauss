// =============================================================================
// DefaultWorkflowEngine — Implements WorkflowPort with all step types
// =============================================================================

import type {
  WorkflowStep,
  WorkflowContext,
  WorkflowResult,
  WorkflowDefinition,
  AnyStep,
  ParallelStep,
  ConditionalStep,
  LoopStep,
  AgentStep,
  RetryConfig,
  WorkflowEvent,
} from "../../domain/workflow.schema.js";
import type { WorkflowPort, ValidationResult, WorkflowEventListener } from "../../ports/workflow.port.js";

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
};

const DEFAULT_MAX_ITERATIONS = 10;

export type AgentExecutor = (prompt: string, ctx: WorkflowContext) => Promise<unknown>;

export interface DefaultWorkflowEngineOptions {
  agentExecutor?: AgentExecutor;
  onEvent?: WorkflowEventListener;
}

export class DefaultWorkflowEngine implements WorkflowPort {
  private readonly agentExecutor?: AgentExecutor;
  private readonly onEvent?: WorkflowEventListener;

  constructor(options: DefaultWorkflowEngineOptions = {}) {
    this.agentExecutor = options.agentExecutor;
    this.onEvent = options.onEvent;
  }

  async execute(definition: WorkflowDefinition, context?: WorkflowContext): Promise<WorkflowResult> {
    const start = Date.now();
    let ctx = structuredClone(definition.initialContext ?? {});
    if (context) {
      ctx = { ...ctx, ...structuredClone(context) };
    }

    const completedSteps: string[] = [];
    const skippedSteps: string[] = [];
    // Registry of all executed steps (including nested) for rollback
    const executedRegistry: Map<string, WorkflowStep> = new Map();

    const timeoutMs = definition.maxDurationMs;
    const deadline = timeoutMs ? start + timeoutMs : undefined;

    for (const step of definition.steps) {
      if (deadline && Date.now() >= deadline) {
        await this.rollbackSteps(executedRegistry, completedSteps, ctx);
        return {
          status: "failed",
          context: ctx,
          completedSteps,
          skippedSteps,
          failedStep: step.id,
          error: `Workflow timeout exceeded (${timeoutMs}ms)`,
          totalDurationMs: Date.now() - start,
        };
      }

      try {
        const stepResult = await this.executeStep(step, ctx, completedSteps, skippedSteps, executedRegistry, deadline);
        if (skippedSteps.includes(step.id)) {
          continue;
        }
        ctx = stepResult;
        completedSteps.push(step.id);
      } catch (error) {
        await this.rollbackSteps(executedRegistry, completedSteps, ctx);
        return {
          status: "failed",
          context: ctx,
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
      context: ctx,
      completedSteps,
      skippedSteps,
      totalDurationMs: Date.now() - start,
    };
  }

  validate(definition: WorkflowDefinition): ValidationResult {
    const errors: string[] = [];

    if (!definition.id) errors.push("Workflow must have an id");
    if (!definition.name) errors.push("Workflow must have a name");
    if (!definition.steps || !Array.isArray(definition.steps)) {
      errors.push("Workflow must have a steps array");
    } else if (definition.steps.length === 0) {
      errors.push("Workflow must have at least one step");
    }

    const ids = new Set<string>();
    for (const step of definition.steps ?? []) {
      if (!step.id) errors.push("Every step must have an id");
      if (!step.name) errors.push(`Step "${step.id}" must have a name`);
      if (ids.has(step.id)) errors.push(`Duplicate step id: "${step.id}"`);
      ids.add(step.id);

      this.validateStep(step, errors);
    }

    if (definition.maxDurationMs !== undefined && definition.maxDurationMs <= 0) {
      errors.push("maxDurationMs must be positive");
    }

    return { valid: errors.length === 0, errors };
  }

  // ── Step execution ──────────────────────────────────────────────────────

  private async executeStep(
    step: AnyStep,
    ctx: WorkflowContext,
    completedSteps: string[],
    skippedSteps: string[],
    registry: Map<string, WorkflowStep>,
    deadline?: number,
  ): Promise<WorkflowContext> {
    this.emit({ type: 'step:start', stepId: step.id, stepName: step.name, timestamp: Date.now() });

    try {
      let result: WorkflowContext;

      if (this.isParallelStep(step)) {
        result = await this.executeParallel(step, ctx, registry, deadline);
      } else if (this.isConditionalStep(step)) {
        result = await this.executeConditional(step, ctx, completedSteps, skippedSteps, registry, deadline);
      } else if (this.isLoopStep(step)) {
        result = await this.executeLoop(step, ctx, registry, deadline);
      } else if (this.isAgentStep(step)) {
        result = await this.executeAgent(step, ctx);
        // Register agent steps for rollback
        if ('rollback' in step && typeof (step as WorkflowStep).rollback === 'function') {
          registry.set(step.id, step as unknown as WorkflowStep);
        }
      } else {
        const ws = step as WorkflowStep;
        if (ws.condition && !ws.condition(ctx)) {
          skippedSteps.push(step.id);
          this.emit({ type: 'step:complete', stepId: step.id, stepName: step.name, timestamp: Date.now(), context: ctx });
          return ctx;
        }
        result = await this.executeWithRetry(ws, ctx);
        // Register for rollback
        if (ws.rollback) {
          registry.set(step.id, ws);
        }
      }

      this.emit({ type: 'step:complete', stepId: step.id, stepName: step.name, timestamp: Date.now(), context: result });
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.emit({ type: 'step:error', stepId: step.id, stepName: step.name, timestamp: Date.now(), error: errMsg });
      throw error;
    }
  }

  private async executeParallel(step: ParallelStep, ctx: WorkflowContext, registry: Map<string, WorkflowStep>, deadline?: number): Promise<WorkflowContext> {
    const strategy = step.mergeStrategy ?? 'all';
    const branchCtx = structuredClone(ctx);

    const wrapWithTimeout = (promise: Promise<WorkflowContext>): Promise<WorkflowContext> => {
      if (!deadline) return promise;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return Promise.reject(new Error("Workflow timeout exceeded"));
      let timer: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<WorkflowContext>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Workflow timeout exceeded")), remaining);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer!));
    };

    const promises = step.branches.map((branch) => {
      // Register branch for rollback
      if (branch.rollback) registry.set(branch.id, branch);
      return wrapWithTimeout(this.executeWithRetry(branch, structuredClone(branchCtx)));
    });

    if (strategy === 'race') {
      return await Promise.race(promises);
    }

    if (strategy === 'first') {
      return await Promise.any(promises);
    }

    // 'all' — merge all branch results
    const results = await Promise.all(promises);
    let merged = structuredClone(ctx);
    for (const r of results) {
      merged = { ...merged, ...r };
    }
    return merged;
  }

  private async executeConditional(
    step: ConditionalStep,
    ctx: WorkflowContext,
    completedSteps: string[],
    skippedSteps: string[],
    registry: Map<string, WorkflowStep>,
    deadline?: number,
  ): Promise<WorkflowContext> {
    if (step.condition(ctx)) {
      return this.executeStep(step.ifTrue, structuredClone(ctx), completedSteps, skippedSteps, registry, deadline);
    } else if (step.ifFalse) {
      return this.executeStep(step.ifFalse, structuredClone(ctx), completedSteps, skippedSteps, registry, deadline);
    }
    return ctx;
  }

  private async executeLoop(step: LoopStep, ctx: WorkflowContext, registry: Map<string, WorkflowStep>, deadline?: number): Promise<WorkflowContext> {
    const maxIter = step.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    let current = structuredClone(ctx);

    // Register loop body for rollback
    if (step.body.rollback) {
      registry.set(step.body.id, step.body);
    }

    for (let i = 0; i < maxIter; i++) {
      if (!step.condition(current)) break;
      if (deadline && Date.now() >= deadline) {
        throw new Error("Workflow timeout exceeded");
      }
      current = await this.executeWithRetry(step.body, current);
    }

    return current;
  }

  private async executeAgent(step: AgentStep, ctx: WorkflowContext): Promise<WorkflowContext> {
    // If the step has a custom execute, use retry logic
    if (step.execute) {
      return this.executeWithRetry(step as unknown as WorkflowStep, ctx);
    }

    if (!this.agentExecutor) {
      throw new Error(`AgentStep "${step.id}" requires an agentExecutor`);
    }

    const prompt = typeof step.prompt === 'function' ? step.prompt(ctx) : step.prompt;
    const retry = { ...DEFAULT_RETRY, ...step.retry };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      try {
        const result = await this.agentExecutor(prompt, structuredClone(ctx));
        return { ...ctx, [step.outputKey]: result };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < retry.maxAttempts) {
          const delay = retry.backoffMs * Math.pow(retry.backoffMultiplier, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  // ── Retry ───────────────────────────────────────────────────────────────

  private async executeWithRetry(step: WorkflowStep, ctx: WorkflowContext): Promise<WorkflowContext> {
    const retry = { ...DEFAULT_RETRY, ...step.retry };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      try {
        return await step.execute(structuredClone(ctx));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < retry.maxAttempts) {
          const delay = retry.backoffMs * Math.pow(retry.backoffMultiplier, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  // ── Rollback ────────────────────────────────────────────────────────────

  private async rollbackSteps(
    registry: Map<string, WorkflowStep>,
    completedStepIds: string[],
    ctx: WorkflowContext,
  ): Promise<void> {
    // Rollback all registered steps in reverse order
    const allIds = [...completedStepIds, ...Array.from(registry.keys())];
    const uniqueIds = [...new Set(allIds)].reverse();
    for (const stepId of uniqueIds) {
      const step = registry.get(stepId);
      if (step?.rollback) {
        try {
          await step.rollback(ctx);
        } catch {
          // Swallow rollback errors to ensure all rollbacks are attempted
        }
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private emit(event: WorkflowEvent): void {
    this.onEvent?.(event);
  }

  private isParallelStep(step: AnyStep): step is ParallelStep {
    return (step as ParallelStep).type === 'parallel';
  }

  private isConditionalStep(step: AnyStep): step is ConditionalStep {
    return (step as ConditionalStep).type === 'conditional';
  }

  private isLoopStep(step: AnyStep): step is LoopStep {
    return (step as LoopStep).type === 'loop';
  }

  private isAgentStep(step: AnyStep): step is AgentStep {
    return (step as AgentStep).type === 'agent';
  }

  private validateStep(step: AnyStep, errors: string[]): void {
    if (this.isParallelStep(step)) {
      if (!step.branches || step.branches.length === 0) {
        errors.push(`Parallel step "${step.id}" must have at least one branch`);
      }
    } else if (this.isConditionalStep(step)) {
      if (!step.condition) errors.push(`Conditional step "${step.id}" must have a condition`);
      if (!step.ifTrue) errors.push(`Conditional step "${step.id}" must have an ifTrue step`);
    } else if (this.isLoopStep(step)) {
      if (!step.body) errors.push(`Loop step "${step.id}" must have a body`);
      if (!step.condition) errors.push(`Loop step "${step.id}" must have a condition`);
    } else if (this.isAgentStep(step)) {
      if (!step.prompt) errors.push(`Agent step "${step.id}" must have a prompt`);
      if (!step.outputKey) errors.push(`Agent step "${step.id}" must have an outputKey`);
    } else {
      const ws = step as WorkflowStep;
      if (!ws.execute) errors.push(`Step "${step.id}" must have an execute function`);
    }
  }
}
