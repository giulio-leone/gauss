// =============================================================================
// Workflow Schema — Types for multi-step workflow execution
// =============================================================================

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export type WorkflowContext = Record<string, unknown>;

export interface OutputMapping {
  /** Source path in the step output context */
  source: string;
  /** Target key in the next workflow context */
  targetKey: string;
  /** Optional value transform */
  transform?: (value: unknown, result: WorkflowContext) => unknown;
  /** Fallback value when source is missing/undefined */
  defaultValue?: unknown;
}

export interface InputMapping {
  /** Explicit keys to project from workflow context */
  keys?: string[];
  /** Extract values from paths into new keys */
  paths?: Record<string, string>;
  /** Static default values merged first */
  defaults?: Record<string, unknown>;
  /** Static overrides merged last */
  overrides?: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type?: StepType;
  condition?: (ctx: WorkflowContext) => boolean;
  inputMapping?: InputMapping;
  outputMapping?: OutputMapping[];
  execute: (ctx: WorkflowContext) => Promise<WorkflowContext>;
  rollback?: (ctx: WorkflowContext) => Promise<void>;
  retry?: Partial<RetryConfig>;
}

export interface WorkflowResult {
  status: "completed" | "failed";
  context: WorkflowContext;
  completedSteps: string[];
  skippedSteps: string[];
  failedStep?: string;
  error?: string;
  totalDurationMs: number;
}

// =============================================================================
// Extended Step Types
// =============================================================================

export type StepType =
  | 'sequential'
  | 'parallel'
  | 'conditional'
  | 'loop'
  | 'agent'
  | 'foreach'
  | 'map';

export interface ParallelStep {
  id: string;
  name: string;
  type: 'parallel';
  branches: WorkflowStep[];
  mergeStrategy?: 'all' | 'first' | 'race';
}

export interface ConditionalStep {
  id: string;
  name: string;
  type: 'conditional';
  condition: (ctx: WorkflowContext) => boolean;
  ifTrue: WorkflowStep;
  ifFalse?: WorkflowStep;
}

export interface LoopStep {
  id: string;
  name: string;
  type: 'loop';
  body: WorkflowStep;
  condition: (ctx: WorkflowContext) => boolean;
  maxIterations?: number;
}

export interface ForeachStep {
  id: string;
  name: string;
  type: 'foreach';
  /** Path to iterable in context, e.g. "items" or "payload.results" */
  iterable: string;
  /** Step executed for each item */
  step: WorkflowStep;
  /** Item variable name exposed in item context. Default: "item" */
  itemKey?: string;
  /** Optional index variable name. Default: "index" */
  indexKey?: string;
  /** Aggregate output key in final context. Default: step id */
  aggregateOutputKey?: string;
  /** Aggregate behavior for per-item outputs. Default: "array" */
  aggregationMode?: 'array' | 'concat' | 'merge';
  /** Maximum concurrent item executions. Default: 1 */
  maxConcurrency?: number;
  /** Safety cap on iterations */
  maxIterations?: number;
}

export interface MapStep {
  id: string;
  name: string;
  type: 'map';
  /** Path to input array in context */
  input: string;
  /** Transform step executed for each item */
  transform: WorkflowStep;
  /** Output collection key */
  outputKey: string;
  /** Item variable name exposed in item context. Default: "item" */
  itemKey?: string;
  /** Optional index variable name. Default: "index" */
  indexKey?: string;
  /** Optional item filter */
  filter?: (item: unknown, index: number, ctx: WorkflowContext) => boolean;
  /** Maximum concurrent item executions. Default: 1 */
  maxConcurrency?: number;
}

export interface AgentStep {
  id: string;
  name: string;
  type: 'agent';
  prompt: string | ((ctx: WorkflowContext) => string);
  outputKey: string;
  execute?: (ctx: WorkflowContext) => Promise<WorkflowContext>;
  rollback?: (ctx: WorkflowContext) => Promise<void>;
  retry?: Partial<RetryConfig>;
}

export type AnyStep =
  | WorkflowStep
  | ParallelStep
  | ConditionalStep
  | LoopStep
  | ForeachStep
  | MapStep
  | AgentStep;

export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: AnyStep[];
  initialContext?: WorkflowContext;
  maxDurationMs?: number;
}

// =============================================================================
// Workflow Validation
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// =============================================================================
// Workflow Events
// =============================================================================

export type WorkflowEventType = 'step:start' | 'step:complete' | 'step:error';

export interface WorkflowEvent {
  type: WorkflowEventType;
  stepId: string;
  stepName: string;
  timestamp: number;
  context?: WorkflowContext;
  error?: string;
}
