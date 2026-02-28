/**
 * Standalone workflow sub-path export.
 * Import as: `gauss/workflow`
 * No Node.js or AI SDK dependencies — safe for browser/extension contexts.
 */
export { defineWorkflow, WorkflowBuilder } from '../domain/workflow.builder.js';
export type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowResult,
  WorkflowEvent,
  AnyStep,
} from '../domain/workflow.schema.js';
export type {
  WorkflowPort,
  ValidationResult,
  WorkflowEventListener,
} from '../ports/workflow.port.js';
