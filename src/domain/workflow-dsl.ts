// =============================================================================
// WorkflowDSL — Fluent chainable API for building workflows
// Usage: workflow('my-flow').then(step).branch(cond, ifTrue, ifFalse).parallel(steps).build()
// =============================================================================

import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  RetryConfig,
} from "../domain/workflow.schema.js";
import { z } from "zod";

// =============================================================================
// Types
// =============================================================================

export interface StepDefinition {
  id: string;
  name?: string;
  execute: (ctx: WorkflowContext) => Promise<WorkflowContext>;
  rollback?: (ctx: WorkflowContext) => Promise<void>;
  retry?: Partial<RetryConfig>;
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
}

export interface BranchDefinition {
  condition: (ctx: WorkflowContext) => boolean;
  ifTrue: StepDefinition | StepDefinition[];
  ifFalse?: StepDefinition | StepDefinition[];
}

interface DSLNode {
  type: "step" | "branch" | "parallel" | "converge";
  step?: StepDefinition;
  branch?: BranchDefinition;
  parallel?: StepDefinition[];
  converge?: ConvergeDefinition;
}

export interface ConvergeDefinition {
  id: string;
  name?: string;
  reducer: (contexts: WorkflowContext[]) => WorkflowContext;
}

// =============================================================================
// WorkflowDSL class
// =============================================================================

export class WorkflowDSL {
  private _id: string;
  private _name?: string;
  private nodes: DSLNode[] = [];

  constructor(id: string) {
    this._id = id;
  }

  /** Set workflow name */
  name(name: string): this {
    this._name = name;
    return this;
  }

  /** Add a sequential step */
  then(step: StepDefinition): this {
    this.nodes.push({ type: "step", step });
    return this;
  }

  /** Add a conditional branch */
  branch(
    condition: (ctx: WorkflowContext) => boolean,
    ifTrue: StepDefinition | StepDefinition[],
    ifFalse?: StepDefinition | StepDefinition[]
  ): this {
    this.nodes.push({
      type: "branch",
      branch: { condition, ifTrue, ifFalse },
    });
    return this;
  }

  /** Add parallel steps (all execute concurrently) */
  parallel(...steps: StepDefinition[]): this {
    this.nodes.push({ type: "parallel", parallel: steps });
    return this;
  }

  /** Converge parallel results with a custom reducer */
  converge(
    id: string,
    reducer: (contexts: WorkflowContext[]) => WorkflowContext,
    name?: string
  ): this {
    this.nodes.push({
      type: "converge",
      converge: { id, reducer, name },
    });
    return this;
  }

  /** Compile DSL to WorkflowDefinition for the engine */
  build(): WorkflowDefinition {
    const steps: WorkflowStep[] = [];
    let idx = 0;

    for (const node of this.nodes) {
      switch (node.type) {
        case "step":
          if (node.step) {
            steps.push(this.toWorkflowStep(node.step));
          }
          break;

        case "branch":
          if (node.branch) {
            steps.push(this.buildBranchStep(node.branch, idx));
          }
          break;

        case "parallel":
          if (node.parallel) {
            steps.push(this.buildParallelStep(node.parallel, idx));
          }
          break;

        case "converge":
          if (node.converge) {
            steps.push(this.buildConvergeStep(node.converge));
          }
          break;
      }
      idx++;
    }

    return {
      id: this._id,
      name: this._name ?? this._id,
      steps,
    };
  }

  private toWorkflowStep(def: StepDefinition): WorkflowStep {
    const step: WorkflowStep = {
      id: def.id,
      name: def.name ?? def.id,
      execute: this.wrapWithValidation(def),
      rollback: def.rollback,
      retry: def.retry,
    };
    return step;
  }

  private wrapWithValidation(
    def: StepDefinition
  ): (ctx: WorkflowContext) => Promise<WorkflowContext> {
    return async (ctx: WorkflowContext) => {
      if (def.inputSchema) {
        def.inputSchema.parse(ctx);
      }
      const result = await def.execute(ctx);
      if (def.outputSchema) {
        def.outputSchema.parse(result);
      }
      return result;
    };
  }

  private buildBranchStep(
    branch: BranchDefinition,
    idx: number
  ): WorkflowStep {
    const ifTrueSteps = Array.isArray(branch.ifTrue)
      ? branch.ifTrue
      : [branch.ifTrue];
    const ifFalseSteps = branch.ifFalse
      ? Array.isArray(branch.ifFalse)
        ? branch.ifFalse
        : [branch.ifFalse]
      : [];

    return {
      id: `branch-${idx}`,
      name: `Branch ${idx}`,
      condition: branch.condition,
      execute: async (ctx: WorkflowContext) => {
        const path = branch.condition(ctx) ? ifTrueSteps : ifFalseSteps;
        let result = ctx;
        for (const s of path) {
          result = await this.wrapWithValidation(s)(result);
        }
        return result;
      },
    };
  }

  private buildParallelStep(
    steps: StepDefinition[],
    idx: number
  ): WorkflowStep {
    return {
      id: `parallel-${idx}`,
      name: `Parallel ${idx}`,
      type: "parallel",
      execute: async (ctx: WorkflowContext) => {
        const results = await Promise.all(
          steps.map((s) => this.wrapWithValidation(s)({ ...ctx }))
        );
        // Store individual results for downstream converge, and merge into context
        const merged = results.reduce(
          (acc, r) => ({ ...acc, ...r }),
          ctx
        );
        (merged as Record<string, unknown>)._parallelResults = results;
        return merged;
      },
    };
  }

  private buildConvergeStep(def: ConvergeDefinition): WorkflowStep {
    return {
      id: def.id,
      name: def.name ?? `Converge ${def.id}`,
      execute: async (ctx: WorkflowContext) => {
        const parallelResults =
          (ctx as Record<string, unknown>)._parallelResults as
            | WorkflowContext[]
            | undefined;
        const result = def.reducer(parallelResults ?? [ctx]);
        const out = result as Record<string, unknown>;
        delete out._parallelResults;
        return result;
      },
    };
  }

}
export function workflow(id: string): WorkflowDSL {
  return new WorkflowDSL(id);
}
