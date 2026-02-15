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
