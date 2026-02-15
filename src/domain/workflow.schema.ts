// =============================================================================
// Workflow Schema — Types for multi-step workflow execution
// =============================================================================

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export type WorkflowContext = Record<string, unknown>;

export interface WorkflowStep {
  id: string;
  name: string;
  type?: StepType;
  condition?: (ctx: WorkflowContext) => boolean;
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

export type StepType = 'sequential' | 'parallel' | 'conditional' | 'loop' | 'agent';

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

export type AnyStep = WorkflowStep | ParallelStep | ConditionalStep | LoopStep | AgentStep;

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
