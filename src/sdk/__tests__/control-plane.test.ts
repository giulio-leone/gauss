import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

  it("supports auth token protection", async () => {
    const cp = new ControlPlane({ authToken: "secret-token" });
    const { url } = await cp.startServer("127.0.0.1", 0);

    const denied = await fetch(`${url}/api/snapshot`);
    expect(denied.status).toBe(401);

    const allowed = await fetch(`${url}/api/snapshot?token=secret-token`);
    expect(allowed.status).toBe(200);

    await cp.stopServer();
  });

  it("enforces auth claims on query scopes", async () => {
    const cp = new ControlPlane({
      authToken: "claims-token",
      authClaims: {
        tenantId: "t-1",
        allowedSessionIds: ["s-1"],
        allowedRunIds: ["r-1"],
      },
      telemetry: {
        exportSpans: () => [{ name: "s1" }],
        exportMetrics: () => ({ totalSpans: 1 }),
      },
      approvals: {
        listPending: () => [],
      },
    });

    cp.withContext({ tenantId: "t-1", sessionId: "s-1", runId: "r-1" }).snapshot();
    const { url } = await cp.startServer("127.0.0.1", 0);

    const scoped = await fetch(`${url}/api/history?token=claims-token`);
    expect(scoped.status).toBe(200);
    const scopedBody = await scoped.json() as Array<{ context: { tenantId?: string } }>;
    expect(scopedBody.length).toBe(1);
    expect(scopedBody[0].context.tenantId).toBe("t-1");

    const forbidden = await fetch(`${url}/api/history?token=claims-token&tenant=t-2`);
    expect(forbidden.status).toBe(403);

    await cp.stopServer();
  });

  it("supports section filters, history, timeline, dag, and persistence", async () => {
    const persistPath = join(tmpdir(), `gauss-cp-${Date.now()}.jsonl`);
    const cp = new ControlPlane({
      persistPath,
      telemetry: {
        exportSpans: () => [{ name: "s1" }, { name: "s2" }],
        exportMetrics: () => ({ totalSpans: 2 }),
      },
      approvals: {
        listPending: () => [{ id: "req-1" }],
      },
      model: "cp-test-model",
    });
    setPricing("cp-test-model", { inputPerToken: 0.001, outputPerToken: 0.001 });
    cp.setCostUsage({ inputTokens: 2, outputTokens: 3 });

    const { url } = await cp.startServer("127.0.0.1", 0);
    const metricsOnly = await fetch(`${url}/api/snapshot?section=metrics`);
    const metricsBody = await metricsOnly.json() as { metrics: { totalSpans: number } };
    expect(metricsBody.metrics.totalSpans).toBe(2);

    const timelineRes = await fetch(`${url}/api/timeline`);
    const timeline = await timelineRes.json() as Array<{ spanCount: number; pendingApprovalsCount: number }>;
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[timeline.length - 1].spanCount).toBe(2);
    expect(timeline[timeline.length - 1].pendingApprovalsCount).toBe(1);

    const dagRes = await fetch(`${url}/api/dag`);
    const dag = await dagRes.json() as { nodes: Array<unknown>; edges: Array<unknown> };
    expect(dag.nodes.length).toBe(2);
    expect(dag.edges.length).toBe(1);

    await cp.stopServer();
    clearPricing();
    expect(existsSync(persistPath)).toBe(true);
    const lines = readFileSync(persistPath, "utf8").trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    rmSync(persistPath, { force: true });
  });

  it("supports tenant/session filters for history, timeline, and dag", async () => {
    const cp = new ControlPlane({
      telemetry: {
        exportSpans: () => [{ name: "s1" }],
        exportMetrics: () => ({ totalSpans: 1 }),
      },
      approvals: {
        listPending: () => [],
      },
    });

    cp.withContext({ tenantId: "t-1", sessionId: "s-1", runId: "r-1" }).snapshot();
    cp.withContext({ tenantId: "t-2", sessionId: "s-2", runId: "r-2" }).snapshot();

    const { url } = await cp.startServer("127.0.0.1", 0);

    const historyRes = await fetch(`${url}/api/history?tenant=t-1`);
    const history = await historyRes.json() as Array<{ context: { tenantId?: string } }>;
    expect(history.length).toBe(1);
    expect(history[0].context.tenantId).toBe("t-1");

    const timelineRes = await fetch(`${url}/api/timeline?session=s-2`);
    const timeline = await timelineRes.json() as Array<{ spanCount: number }>;
    expect(timeline.length).toBe(1);
    expect(timeline[0].spanCount).toBe(1);

    const dagRes = await fetch(`${url}/api/dag?run=r-1`);
    const dag = await dagRes.json() as { nodes: Array<{ label: string }> };
    expect(dag.nodes.length).toBe(1);
    expect(dag.nodes[0].label).toBe("s1");

    await cp.stopServer();
  });
});
