// =============================================================================
// Policy Port — Allow/Deny governance and audit for tool invocations
// =============================================================================

export type PolicyEffect = "allow" | "deny";

export interface PolicyContext {
  sessionId?: string;
  userId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyRequest {
  action: "invoke";
  resource: string;
  serverName?: string;
  toolName?: string;
}

export interface PolicyRule {
  id: string;
  effect: PolicyEffect;
  /** Wildcard pattern, e.g. "docs:*" or "calc:add" */
  resourcePattern: string;
  /** Optional wildcard server matcher */
  serverPattern?: string;
  /** Optional wildcard tool matcher */
  toolPattern?: string;
  /** Rule priority, higher wins. Default: 0 */
  priority?: number;
  /** Optional contextual constraints */
  context?: {
    sessionId?: string;
    userId?: string;
    tenantId?: string;
  };
  reason?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  effect: PolicyEffect;
  reason?: string;
  matchedRuleId?: string;
  auditId: string;
}

export interface PolicyAuditRecord {
  id: string;
  timestamp: string;
  request: PolicyRequest;
  context: PolicyContext;
  decision: PolicyDecision;
}

export interface PolicyEnginePort {
  evaluate(request: PolicyRequest, context: PolicyContext): Promise<PolicyDecision>;
  addRule(rule: PolicyRule): Promise<void>;
  setRules(rules: PolicyRule[]): Promise<void>;
  listRules(): Promise<PolicyRule[]>;
  getAuditLog(limit?: number): Promise<PolicyAuditRecord[]>;
  clearAuditLog(): Promise<void>;
}
