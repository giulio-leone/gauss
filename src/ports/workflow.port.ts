// =============================================================================
// WorkflowPort — Contract for workflow execution engines
// =============================================================================

import type { WorkflowDefinition, WorkflowContext, WorkflowResult, WorkflowEvent } from "../domain/workflow.schema.js";

export interface WorkflowPort {
  execute(definition: WorkflowDefinition, context?: WorkflowContext): Promise<WorkflowResult>;
  validate(definition: WorkflowDefinition): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export type WorkflowEventListener = (event: WorkflowEvent) => void;
