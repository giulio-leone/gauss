// =============================================================================
// WorkflowBuilder — Fluent DSL for defining workflows
// =============================================================================

import type {
  WorkflowStep,
  WorkflowContext,
  WorkflowDefinition,
  AnyStep,
  ParallelStep,
  ConditionalStep,
  LoopStep,
  AgentStep,
  RetryConfig,
} from "./workflow.schema.js";

type ConditionFn = (ctx: WorkflowContext) => boolean;
type RollbackFn = (ctx: WorkflowContext) => Promise<void>;
type PromptFn = (ctx: WorkflowContext) => string;

interface ConditionalOpts {
  condition: ConditionFn;
  ifTrue: WorkflowStep;
  ifFalse?: WorkflowStep;
}

interface LoopOpts {
  body: WorkflowStep;
  condition: ConditionFn;
  maxIterations?: number;
}

export class WorkflowBuilder {
  private readonly id: string;
  private readonly workflowName: string;
  private readonly steps: AnyStep[] = [];
  private timeoutMs?: number;
  private initCtx?: WorkflowContext;

  constructor(id: string, name: string) {
    this.id = id;
    this.workflowName = name;
  }

  step(
    id: string,
    name: string,
    execute: (ctx: WorkflowContext) => Promise<WorkflowContext>,
  ): this {
    this.steps.push({ id, name, execute });
    return this;
  }

  parallel(id: string, name: string, branches: WorkflowStep[], mergeStrategy?: 'all' | 'first' | 'race'): this {
    const step: ParallelStep = { id, name, type: 'parallel', branches, mergeStrategy };
    this.steps.push(step);
    return this;
  }

  conditional(id: string, name: string, opts: ConditionalOpts): this {
    const step: ConditionalStep = {
      id,
      name,
      type: 'conditional',
      condition: opts.condition,
      ifTrue: opts.ifTrue,
      ifFalse: opts.ifFalse,
    };
    this.steps.push(step);
    return this;
  }

  loop(id: string, name: string, opts: LoopOpts): this {
    const step: LoopStep = {
      id,
      name,
      type: 'loop',
      body: opts.body,
      condition: opts.condition,
      maxIterations: opts.maxIterations,
    };
    this.steps.push(step);
    return this;
  }

  agentStep(id: string, name: string, prompt: string | PromptFn, outputKey: string): this {
    const step: AgentStep = { id, name, type: 'agent', prompt, outputKey };
    this.steps.push(step);
    return this;
  }

  /** Apply retry config to the last added step */
  withRetry(config: Partial<RetryConfig>): this {
    const last = this.steps[this.steps.length - 1];
    if (!last) throw new Error("withRetry: no step to apply to");
    (last as WorkflowStep).retry = config;
    return this;
  }

  /** Apply rollback to the last added step */
  withRollback(fn: RollbackFn): this {
    const last = this.steps[this.steps.length - 1];
    if (!last) throw new Error("withRollback: no step to apply to");
    (last as WorkflowStep).rollback = fn;
    return this;
  }

  /** Apply condition to the last added step */
  withCondition(fn: ConditionFn): this {
    const last = this.steps[this.steps.length - 1];
    if (!last) throw new Error("withCondition: no step to apply to");
    (last as WorkflowStep).condition = fn;
    return this;
  }

  withTimeout(ms: number): this {
    this.timeoutMs = ms;
    return this;
  }

  withInitialContext(ctx: WorkflowContext): this {
    this.initCtx = ctx;
    return this;
  }

  build(): WorkflowDefinition {
    return {
      id: this.id,
      name: this.workflowName,
      steps: this.steps,
      initialContext: this.initCtx,
      maxDurationMs: this.timeoutMs,
    };
  }
}

export function defineWorkflow(id: string, name: string): WorkflowBuilder {
  return new WorkflowBuilder(id, name);
}
