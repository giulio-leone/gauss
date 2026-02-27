import { describe, expect, it } from "vitest";

import { McpPolicyEngine } from "../../../adapters/policy/mcp-policy-engine.js";
import { createPolicyTools } from "../index.js";

describe("policy tools", () => {
  it("adds, lists and removes rules", async () => {
    const engine = new McpPolicyEngine();
    const tools = createPolicyTools(engine);

    const add = tools["policy_add_rule"] as any;
    const list = tools["policy_list_rules"] as any;
    const remove = tools["policy_remove_rule"] as any;

    await add.execute({
      id: "deny-calc",
      effect: "deny",
      resourcePattern: "calc:*",
      reason: "Disabled",
    });

    const listed = await list.execute({});
    expect(listed.count).toBe(1);
    expect(listed.rules[0]?.id).toBe("deny-calc");

    const removed = await remove.execute({ id: "deny-calc" });
    expect(removed.removed).toBe(true);

    const listedAfter = await list.execute({});
    expect(listedAfter.count).toBe(0);
  });

  it("lists and clears audit records", async () => {
    const engine = new McpPolicyEngine();
    const tools = createPolicyTools(engine);

    await engine.evaluate(
      { action: "invoke", resource: "docs:list" },
      { sessionId: "s-1" },
    );

    const listAudit = tools["policy_list_audit"] as any;
    const clearAudit = tools["policy_clear_audit"] as any;

    const audits = await listAudit.execute({ limit: 10 });
    expect(audits.count).toBe(1);

    const cleared = await clearAudit.execute({});
    expect(cleared.ok).toBe(true);

    const after = await listAudit.execute({ limit: 10 });
    expect(after.count).toBe(0);
  });
});
