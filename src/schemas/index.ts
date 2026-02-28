// =============================================================================
// Schemas — Public API (sub-entry point: gauss-ai/schemas)
// =============================================================================

// Todo
export {
  TodoSchema,
  TodoStatusSchema,
  TodoListSchema,
  WriteTodosInputSchema,
  UpdateTodoInputSchema,
  type Todo,
  type TodoStatus,
  type TodoList,
  type WriteTodosInput,
  type UpdateTodoInput,
} from "../domain/todo.schema.js";

// Plan
export {
  StepExecutionModeSchema,
  StepStatusSchema as PlanStepStatusSchema,
  StepPrioritySchema,
  PlanStatusSchema,
  PlanEventTypeSchema,
  ResourceRequirementsSchema,
  IOFieldSchema,
  StepContractSchema,
  StepResultSchema,
  StepConditionSchema,
  LoopConfigSchema,
  SubStepSchema,
  StepSchema as PlanStepSchema,
  PhaseSchema,
  PlanMetadataSchema,
  PlanSchema,
  PlanEventSchema,
  PlanProgressSchema,
  PhaseProgressSchema,
  StepProgressSchema,
  STEP_STATUS_TRANSITIONS,
  PLAN_STATUS_TRANSITIONS,
  isValidStepTransition,
  isValidPlanTransition,
  transitionStep,
  createStep,
  createPhase,
  createSubStep,
  createPlan,
  generateStepId,
  validatePlan,
  calculateProgress,
  todosToplan as todosToPlan,
  createExamplePlan,
  type StepExecutionMode,
  type StepStatus as PlanStepStatus,
  type StepPriority,
  type PlanStatus,
  type ResourceRequirements,
  type IOField,
  type StepContract,
  type StepResult,
  type StepCondition,
  type LoopConfig,
  type SubStep,
  type Step as PlanStep,
  type Phase,
  type PlanMetadata,
  type Plan,
  type PlanEvent,
  type PlanEventType,
  type PlanProgress,
  type PhaseProgress,
  type StepProgress,
  type PlanValidationResult,
} from "../domain/plan.schema.js";

// Checkpoint
export { CheckpointSchema, type Checkpoint } from "../domain/checkpoint.schema.js";

// Learning
export {
  UserProfileSchema,
  UserMemorySchema,
  SharedKnowledgeSchema,
  type UserProfile,
  type UserMemory,
  type UserMemoryInput,
  type SharedKnowledge,
  type SharedKnowledgeInput,
} from "../domain/learning.schema.js";

// Conversation
export {
  MessageSchema,
  CompressedContextSchema,
  ConversationStateSchema,
  type MessageType,
  type CompressedContextType,
  type ConversationState,
} from "../domain/conversation.schema.js";

// Events
export {
  AgentEventTypeSchema,
  AgentEventSchema,
  type AgentEventTypeValue,
  type AgentEventValue,
} from "../domain/events.schema.js";

// Eval
export { EvalMetricsSchema, EvalResultSchema, type EvalMetrics, type EvalResult } from "../domain/eval.schema.js";

// Graph
export type { GraphConfig, GraphResult, GraphStreamEvent } from "../domain/graph.schema.js";

// Workflow
export type {
  RetryConfig,
  WorkflowStep,
  WorkflowContext,
  InputMapping,
  OutputMapping,
  WorkflowResult,
  StepType,
  ParallelStep,
  ConditionalStep,
  LoopStep,
  ForeachStep,
  MapStep,
  AgentStep,
  AnyStep,
  WorkflowDefinition,
  ValidationResult as WorkflowValidationResult,
  WorkflowEventType,
  WorkflowEvent,
} from "../domain/workflow.schema.js";

// Compiler
export {
  StructuredDeclarationSchema,
  CompilerOutputSchema,
  SkillDeclarationSchema,
  AgentDeclarationSchema,
  A2ARouteSchema,
  TriggerSchema,
  ChannelSchema,
  PolicySchema,
  StepDeclarationSchema,
  MonitorStepSchema,
  FilterStepSchema,
  TransformStepSchema,
  PublishStepSchema,
  CustomStepSchema,
  validateDeclaration,
} from "../domain/compiler.schema.js";
export type {
  StructuredDeclaration,
  Trigger,
  CronTrigger,
  EventTrigger,
  ManualTrigger,
  WebhookTrigger,
  Channel,
  ChannelPolicy,
  Policy,
  StepDeclaration,
  MonitorStep,
  FilterStep,
  TransformStep,
  PublishStep,
  CustomStep,
  SkillDeclaration,
  AgentDeclaration,
  A2ARoute,
  CompilerOutput,
  LLMCompilerOutput,
} from "../domain/compiler.schema.js";

// Zod ↔ JSON Schema conversion
export { zodToJsonSchema, validateWithZod } from "../core/schema/zod-to-json-schema.js";
