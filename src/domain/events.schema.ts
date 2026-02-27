// =============================================================================
// Events Schema — Agent lifecycle events
// =============================================================================

import { z } from "zod";

export const AgentEventTypeSchema = z.enum([
  "agent:start",
  "agent:stop",
  "step:start",
  "step:end",
  "tool:call",
  "tool:result",
  "tool:approval-required",
  "tool:approved",
  "tool:denied",
  "checkpoint:save",
  "checkpoint:load",
  "context:summarize",
  "context:offload",
  "context:truncate",
  "subagent:spawn",
  "subagent:complete",
  "planning:update",
  "plan:created",
  "plan:started",
  "plan:completed",
  "plan:failed",
  "plan:updated",
  "plan:phase:started",
  "plan:phase:completed",
  "plan:step:started",
  "plan:step:completed",
  "plan:step:failed",
  "error",
  "graph:start",
  "graph:complete",
  "node:start",
  "node:complete",
  "consensus:start",
  "consensus:result",
  "fork:start",
  "fork:complete",
  "supervisor:start",
  "supervisor:stop",
  "supervisor:task:assigned",
  "supervisor:task:completed",
  "subagent:start",
  "subagent:stop",
  "subagent:message",
  "delegation:start",
  "delegation:blocked",
  "delegation:iteration",
  "delegation:complete",
  "delegation:message-filtered",
  "graph:node:retry",
  "graph:edge:traverse",
]);

export type AgentEventTypeValue = z.infer<typeof AgentEventTypeSchema>;

export const AgentEventSchema = z.object({
  type: AgentEventTypeSchema,
  timestamp: z.number(),
  sessionId: z.string(),
  data: z.unknown(),
});

export type AgentEventValue = z.infer<typeof AgentEventSchema>;
