import { describe, it, expect } from "vitest";

import { ControlPlane } from "../control-plane.js";
import { clearPricing, setPricing } from "../tokens.js";

describe("ControlPlane", () => {
  it("builds snapshots from telemetry and approvals", () => {
    const cp = new ControlPlane({
      telemetry: {
        exportSpans: () => [{ name: "agent.run", duration_ms: 12 }],
        exportMetrics: () => ({ totalSpans: 1 }),
      },
      approvals: {
        listPending: () => [{ id: "req-1", tool: "delete_user" }],
      },
    });

    const snap = cp.snapshot();
    expect(Array.isArray(snap.spans)).toBe(true);
    expect((snap.spans as Array<{ name: string }>)[0].name).toBe("agent.run");
    expect((snap.metrics as { totalSpans: number }).totalSpans).toBe(1);
    expect((snap.pendingApprovals as Array<{ id: string }>)[0].id).toBe("req-1");
  });

  it("computes latest cost from usage", () => {
    setPricing("cp-test-model", {
      inputPerToken: 0.001,
      outputPerToken: 0.002,
    });

    const cp = new ControlPlane({ model: "cp-test-model" });
    cp.setCostUsage({ inputTokens: 10, outputTokens: 5 });
    const snap = cp.snapshot();
    expect(snap.latestCost?.totalCostUsd).toBeCloseTo(0.02, 6);

    clearPricing();
  });

  it("serves dashboard and snapshot endpoint", async () => {
    const cp = new ControlPlane();
    const { url } = await cp.startServer("127.0.0.1", 0);

    const apiRes = await fetch(`${url}/api/snapshot`);
    expect(apiRes.status).toBe(200);
    const body = await apiRes.json() as { generatedAt: string };
    expect(typeof body.generatedAt).toBe("string");

    const htmlRes = await fetch(`${url}/`);
    const html = await htmlRes.text();
    expect(html).toContain("Gauss Control Plane");

    await cp.stopServer();
  });
});

