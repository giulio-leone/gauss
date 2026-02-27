import { tool, type Tool } from "ai";
import { z } from "zod";

import type {
  PolicyContext,
  PolicyEnginePort,
  PolicyRule,
} from "../../ports/policy.port.js";

const policyRuleSchema = z.object({
  id: z.string().min(1),
  effect: z.enum(["allow", "deny"]),
  resourcePattern: z.string().min(1),
  serverPattern: z.string().optional(),
  toolPattern: z.string().optional(),
  priority: z.number().int().optional(),
  reason: z.string().optional(),
  context: z
    .object({
      sessionId: z.string().optional(),
      userId: z.string().optional(),
      tenantId: z.string().optional(),
    })
    .optional(),
});

function normalizeRule(input: z.infer<typeof policyRuleSchema>): PolicyRule {
  const context: PolicyContext | undefined = input.context
    ? {
        ...(input.context.sessionId
          ? { sessionId: input.context.sessionId }
          : {}),
        ...(input.context.userId ? { userId: input.context.userId } : {}),
        ...(input.context.tenantId ? { tenantId: input.context.tenantId } : {}),
      }
    : undefined;

  return {
    id: input.id,
    effect: input.effect,
    resourcePattern: input.resourcePattern,
    ...(input.serverPattern ? { serverPattern: input.serverPattern } : {}),
    ...(input.toolPattern ? { toolPattern: input.toolPattern } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(context ? { context } : {}),
  };
}

export function createPolicyTools(policyEngine: PolicyEnginePort): Record<string, Tool> {
  return {
    policy_list_rules: tool({
      description: "List current policy rules sorted by priority",
      inputSchema: z.object({}),
      execute: async () => {
        const rules = await policyEngine.listRules();
        return { rules, count: rules.length };
      },
    }),

    policy_add_rule: tool({
      description: "Add a new policy rule (allow or deny)",
      inputSchema: policyRuleSchema,
      execute: async (input: z.infer<typeof policyRuleSchema>) => {
        const rule = normalizeRule(input);
        await policyEngine.addRule(rule);
        return { ok: true, ruleId: rule.id };
      },
    }),

    policy_remove_rule: tool({
      description: "Remove an existing policy rule by id",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }: { id: string }) => {
        const removed = await policyEngine.removeRule(id);
        return { ok: true, removed, ruleId: id };
      },
    }),

    policy_list_audit: tool({
      description: "List policy audit records (most recent first)",
      inputSchema: z.object({ limit: z.number().int().positive().optional() }),
      execute: async ({ limit }: { limit?: number }) => {
        const audit = await policyEngine.getAuditLog(limit);
        return { audit, count: audit.length };
      },
    }),

    policy_clear_audit: tool({
      description: "Clear policy audit records",
      inputSchema: z.object({}),
      execute: async () => {
        await policyEngine.clearAuditLog();
        return { ok: true };
      },
    }),
  };
}
