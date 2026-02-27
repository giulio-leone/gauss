import { describe, expect, it } from "vitest";

import { McpPolicyEngine } from "../mcp-policy-engine.js";

describe("McpPolicyEngine", () => {
  it("denies when a matching deny rule exists", async () => {
    const engine = new McpPolicyEngine({
      rules: [
        {
          id: "deny-calc",
          effect: "deny",
          resourcePattern: "calc:*",
          reason: "Calc tools are disabled",
          priority: 100,
        },
        {
          id: "allow-all",
          effect: "allow",
          resourcePattern: "*",
          priority: 1,
        },
      ],
    });

    const decision = await engine.evaluate(
      {
        action: "invoke",
        resource: "calc:add",
        serverName: "calc",
        toolName: "add",
      },
      { sessionId: "s-1" },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.effect).toBe("deny");
    expect(decision.matchedRuleId).toBe("deny-calc");
    expect(decision.reason).toContain("disabled");
  });

  it("supports contextual allow rules", async () => {
    const engine = new McpPolicyEngine({
      defaultEffect: "deny",
      rules: [
        {
          id: "allow-tenant-acme-docs",
          effect: "allow",
          resourcePattern: "docs:*",
          context: { tenantId: "acme" },
          priority: 10,
        },
      ],
    });

    const allowed = await engine.evaluate(
      {
        action: "invoke",
        resource: "docs:read",
        serverName: "docs",
        toolName: "read",
      },
      { tenantId: "acme" },
    );

    const denied = await engine.evaluate(
      {
        action: "invoke",
        resource: "docs:read",
        serverName: "docs",
        toolName: "read",
      },
      { tenantId: "other" },
    );

    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
  });

  it("records audit trail and respects max audit size", async () => {
    const engine = new McpPolicyEngine({
      maxAuditRecords: 2,
      defaultEffect: "allow",
    });

    await engine.evaluate(
      { action: "invoke", resource: "docs:list" },
      { sessionId: "s-1" },
    );
    await engine.evaluate(
      { action: "invoke", resource: "docs:read" },
      { sessionId: "s-1" },
    );
    await engine.evaluate(
      { action: "invoke", resource: "docs:search" },
      { sessionId: "s-1" },
    );

    const audits = await engine.getAuditLog();
    expect(audits).toHaveLength(2);
    expect(audits[0]?.request.resource).toBe("docs:search");
    expect(audits[1]?.request.resource).toBe("docs:read");
  });

  it("removes rules by id", async () => {
    const engine = new McpPolicyEngine({
      rules: [
        {
          id: "r-1",
          effect: "deny",
          resourcePattern: "calc:*",
        },
        {
          id: "r-2",
          effect: "allow",
          resourcePattern: "docs:*",
        },
      ],
    });

    const removed = await engine.removeRule("r-1");
    const rules = await engine.listRules();

    expect(removed).toBe(true);
    expect(rules.map((rule) => rule.id)).toEqual(["r-2"]);
  });
});
