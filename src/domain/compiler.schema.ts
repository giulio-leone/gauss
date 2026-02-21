// =============================================================================
// Compiler Schema — Intermediate Representation for workflow compilation
// =============================================================================
// The StructuredDeclaration is the IR between natural language input and
// compiled WorkflowDefinition + Skills + AgentConfigs + A2A routes.
// =============================================================================

import { z } from "zod";

// -----------------------------------------------------------------------------
// Trigger: when the workflow should execute
// -----------------------------------------------------------------------------

export const CronTriggerSchema = z.object({
  type: z.literal("cron"),
  expression: z.string().describe("Cron expression or human-readable frequency (e.g. 'every 2h', '0 */2 * * *')"),
  timezone: z.string().optional().describe("IANA timezone (e.g. 'Europe/Rome')"),
});

export const EventTriggerSchema = z.object({
  type: z.literal("event"),
  event: z.string().describe("Event name that triggers this workflow (e.g. 'source:new-content')"),
  filter: z.record(z.string(), z.unknown()).optional().describe("Optional filter conditions on event payload"),
});

export const ManualTriggerSchema = z.object({
  type: z.literal("manual"),
});

export const WebhookTriggerSchema = z.object({
  type: z.literal("webhook"),
  path: z.string().optional().describe("Webhook endpoint path"),
});

export const TriggerSchema = z.discriminatedUnion("type", [
  CronTriggerSchema,
  EventTriggerSchema,
  ManualTriggerSchema,
  WebhookTriggerSchema,
]);

// -----------------------------------------------------------------------------
// Channel: target platforms for publishing
// -----------------------------------------------------------------------------

export const ChannelSchema = z.object({
  platform: z.string().describe("Platform identifier (e.g. 'linkedin', 'x', 'instagram', 'facebook', 'whatsapp')"),
  tone: z.string().optional().describe("Content tone for this channel (e.g. 'professional', 'casual', 'formal')"),
  maxLength: z.number().optional().describe("Max content length for this channel"),
  format: z.string().optional().describe("Output format (e.g. 'article', 'thread', 'caption', 'story')"),
});

// -----------------------------------------------------------------------------
// Policy: automation level per channel
// -----------------------------------------------------------------------------

export const ChannelPolicySchema = z.object({
  platform: z.string(),
  mode: z.enum(["auto", "review", "notify"]).describe("auto=YOLO publish, review=human approval, notify=alert only"),
});

export const PolicySchema = z.object({
  default: z.enum(["auto", "review", "notify"]).default("review"),
  channels: z.array(ChannelPolicySchema).optional().describe("Per-channel policy overrides"),
  yolo: z.boolean().default(false).describe("Global YOLO mode: skip all reviews"),
});

// -----------------------------------------------------------------------------
// Step declarations: what the workflow does
// -----------------------------------------------------------------------------

export const MonitorStepSchema = z.object({
  type: z.literal("monitor"),
  id: z.string().optional(),
  source: z.string().describe("URL or source identifier to monitor"),
  description: z.string().describe("What to look for (NL description for AI extraction)"),
  strategy: z.enum(["rss", "adaptive", "fixed"]).default("adaptive"),
  frequency: z.string().optional().describe("Polling frequency (e.g. 'every 2h', 'every 15m')"),
});

export const FilterStepSchema = z.object({
  type: z.literal("filter"),
  id: z.string().optional(),
  criteria: z.string().describe("NL filter criteria (e.g. 'only AI-related articles')"),
  minRelevance: z.number().min(0).max(1).optional().describe("Minimum relevance score (0-1)"),
});

export const TransformStepSchema = z.object({
  type: z.literal("transform"),
  id: z.string().optional(),
  action: z.string().describe("NL transformation (e.g. 'rewrite in professional tone', 'summarize in 3 sentences')"),
  targetChannel: z.string().optional().describe("Target channel for this transformation"),
});

export const PublishStepSchema = z.object({
  type: z.literal("publish"),
  id: z.string().optional(),
  channels: z.array(z.string()).min(1).describe("Target channels for publishing"),
});

export const CustomStepSchema = z.object({
  type: z.literal("custom"),
  id: z.string().optional(),
  description: z.string().describe("NL description of what this step does"),
  agentPrompt: z.string().optional().describe("Optional specific prompt for the agent executing this step"),
});

export const StepDeclarationSchema = z.discriminatedUnion("type", [
  MonitorStepSchema,
  FilterStepSchema,
  TransformStepSchema,
  PublishStepSchema,
  CustomStepSchema,
]);

// -----------------------------------------------------------------------------
// StructuredDeclaration: the full IR
// -----------------------------------------------------------------------------

export const StructuredDeclarationSchema = z.object({
  id: z.string().optional().describe("Optional workflow ID (auto-generated if not provided)"),
  name: z.string().describe("Human-readable workflow name"),
  description: z.string().optional().describe("Optional longer description"),
  triggers: z.array(TriggerSchema).min(1).describe("When this workflow should execute"),
  steps: z.array(StepDeclarationSchema).min(1).describe("Ordered steps of the workflow"),
  channels: z.array(ChannelSchema).optional().describe("Target channels configuration"),
  policy: PolicySchema.optional().describe("Automation policy (auto/review/notify per channel)"),
  tags: z.array(z.string()).optional().describe("Optional tags for categorization"),
  maxDurationMs: z.number().optional().describe("Maximum workflow execution time"),
});

// -----------------------------------------------------------------------------
// Inferred types
// -----------------------------------------------------------------------------

export type CronTrigger = z.infer<typeof CronTriggerSchema>;
export type EventTrigger = z.infer<typeof EventTriggerSchema>;
export type ManualTrigger = z.infer<typeof ManualTriggerSchema>;
export type WebhookTrigger = z.infer<typeof WebhookTriggerSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;

export type Channel = z.infer<typeof ChannelSchema>;
export type ChannelPolicy = z.infer<typeof ChannelPolicySchema>;
export type Policy = z.infer<typeof PolicySchema>;

export type MonitorStep = z.infer<typeof MonitorStepSchema>;
export type FilterStep = z.infer<typeof FilterStepSchema>;
export type TransformStep = z.infer<typeof TransformStepSchema>;
export type PublishStep = z.infer<typeof PublishStepSchema>;
export type CustomStep = z.infer<typeof CustomStepSchema>;
export type StepDeclaration = z.infer<typeof StepDeclarationSchema>;

export type StructuredDeclaration = z.infer<typeof StructuredDeclarationSchema>;

// -----------------------------------------------------------------------------
// Compiler output Zod schemas (for LLM-assisted structured generation)
// -----------------------------------------------------------------------------

export const SkillDeclarationSchema = z.object({
  id: z.string().describe("Unique skill ID (e.g. 'monitor-techcrunch', 'publish-linkedin')"),
  platform: z.string().describe("Target platform (e.g. 'linkedin', 'x', 'web', 'internal')"),
  description: z.string().describe("What this skill does in one sentence"),
  preconditions: z.string().describe("What must be true before this skill can run"),
  flow: z.array(z.string()).describe("Ordered list of actions this skill performs"),
  notes: z.array(z.string()).describe("Implementation notes and edge cases"),
  maxContentLength: z.number().optional().describe("Max output content length (platform-specific)"),
  isExisting: z.boolean().describe("True if this skill already exists in the registry"),
});

export const AgentDeclarationSchema = z.object({
  id: z.string().describe("Unique agent ID (e.g. 'monitor-agent', 'content-agent')"),
  role: z.string().describe("Agent role description (e.g. 'Monitors web sources for new content')"),
  skills: z.array(z.string()).describe("Skill IDs this agent can use"),
  trigger: TriggerSchema.optional().describe("Optional trigger that activates this agent"),
});

export const A2ARouteSchema = z.object({
  from: z.string().describe("Source agent ID"),
  to: z.string().describe("Destination agent ID"),
  event: z.string().describe("Event name that triggers this route (e.g. 'content:detected', 'content:ready')"),
  condition: z.string().optional().describe("Optional NL condition for routing (e.g. 'only if relevance > 0.7')"),
});

export const CompilerOutputSchema = z.object({
  skills: z.array(SkillDeclarationSchema).describe("All skills needed by this workflow"),
  agents: z.array(AgentDeclarationSchema).describe("Agents grouped by role (monitor, filter, content, publisher)"),
  routes: z.array(A2ARouteSchema).describe("A2A communication routes between agents"),
});

// Inferred types from Zod schemas
export type SkillDeclaration = z.infer<typeof SkillDeclarationSchema>;
export type AgentDeclaration = z.infer<typeof AgentDeclarationSchema>;
export type A2ARoute = z.infer<typeof A2ARouteSchema>;

/** LLM-generated portion of the compiler output */
export type LLMCompilerOutput = z.infer<typeof CompilerOutputSchema>;

/** Full compiler output including workflow metadata */
export interface CompilerOutput extends LLMCompilerOutput {
  workflow: {
    id: string;
    name: string;
    declaration: StructuredDeclaration;
  };
}

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------

export function validateDeclaration(input: unknown): { valid: true; data: StructuredDeclaration } | { valid: false; errors: string[] } {
  const result = StructuredDeclarationSchema.safeParse(input);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
