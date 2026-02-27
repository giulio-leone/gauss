import type {
  PolicyAuditRecord,
  PolicyContext,
  PolicyDecision,
  PolicyEffect,
  PolicyEnginePort,
  PolicyRequest,
  PolicyRule,
} from "../../ports/policy.port.js";

const DEFAULT_AUDIT_LIMIT = 1000;

export interface McpPolicyEngineOptions {
  defaultEffect?: PolicyEffect;
  maxAuditRecords?: number;
  rules?: PolicyRule[];
}

export class McpPolicyEngine implements PolicyEnginePort {
  private rules: PolicyRule[];
  private readonly defaultEffect: PolicyEffect;
  private readonly maxAuditRecords: number;
  private auditLog: PolicyAuditRecord[] = [];

  constructor(options: McpPolicyEngineOptions = {}) {
    this.rules = [...(options.rules ?? [])];
    this.defaultEffect = options.defaultEffect ?? "allow";
    this.maxAuditRecords = options.maxAuditRecords ?? DEFAULT_AUDIT_LIMIT;
  }

  async evaluate(
    request: PolicyRequest,
    context: PolicyContext,
  ): Promise<PolicyDecision> {
    const matched = this.findMatchingRules(request, context);

    const denyMatch = matched.find((rule) => rule.effect === "deny");
    const allowMatch = matched.find((rule) => rule.effect === "allow");
    const selected = denyMatch ?? allowMatch;

    const effect: PolicyEffect = selected?.effect ?? this.defaultEffect;
    const decision: PolicyDecision = {
      allowed: effect === "allow",
      effect,
      reason:
        selected?.reason ??
        (selected
          ? `Policy ${effect} by rule ${selected.id}`
          : `Policy ${effect} by default`),
      matchedRuleId: selected?.id,
      auditId: crypto.randomUUID(),
    };

    const record: PolicyAuditRecord = {
      id: decision.auditId,
      timestamp: new Date().toISOString(),
      request,
      context,
      decision,
    };

    this.auditLog.push(record);
    if (this.auditLog.length > this.maxAuditRecords) {
      this.auditLog = this.auditLog.slice(-this.maxAuditRecords);
    }

    return decision;
  }

  async addRule(rule: PolicyRule): Promise<void> {
    this.rules.push(rule);
  }

  async removeRule(id: string): Promise<boolean> {
    const before = this.rules.length;
    this.rules = this.rules.filter((rule) => rule.id !== id);
    return this.rules.length < before;
  }

  async setRules(rules: PolicyRule[]): Promise<void> {
    this.rules = [...rules];
  }

  async listRules(): Promise<PolicyRule[]> {
    return [...this.rules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
  }

  async getAuditLog(limit?: number): Promise<PolicyAuditRecord[]> {
    const ordered = [...this.auditLog].reverse();
    if (!limit || limit <= 0) {
      return ordered;
    }
    return ordered.slice(0, limit);
  }

  async clearAuditLog(): Promise<void> {
    this.auditLog = [];
  }

  private findMatchingRules(
    request: PolicyRequest,
    context: PolicyContext,
  ): PolicyRule[] {
    return [...this.rules]
      .filter((rule) => this.matchesRule(rule, request, context))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  private matchesRule(
    rule: PolicyRule,
    request: PolicyRequest,
    context: PolicyContext,
  ): boolean {
    if (!this.matchesPattern(rule.resourcePattern, request.resource)) {
      return false;
    }

    if (
      rule.serverPattern &&
      !this.matchesPattern(rule.serverPattern, request.serverName ?? "")
    ) {
      return false;
    }

    if (
      rule.toolPattern &&
      !this.matchesPattern(rule.toolPattern, request.toolName ?? "")
    ) {
      return false;
    }

    if (rule.context?.sessionId && rule.context.sessionId !== context.sessionId) {
      return false;
    }
    if (rule.context?.userId && rule.context.userId !== context.userId) {
      return false;
    }
    if (rule.context?.tenantId && rule.context.tenantId !== context.tenantId) {
      return false;
    }

    return true;
  }

  private matchesPattern(pattern: string, value: string): boolean {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
    return regex.test(value);
  }
}
