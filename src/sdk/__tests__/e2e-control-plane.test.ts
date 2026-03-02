import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, readFileSync, rmSync } from "node:fs";

import { ControlPlane } from "../control-plane.js";
import { clearPricing, setPricing } from "../tokens.js";

describe("ControlPlane E2E", () => {
  it("serves secured operational endpoints end-to-end", async () => {
    const persistPath = join(tmpdir(), `gauss-cp-e2e-${Date.now()}.jsonl`);
    setPricing("cp-e2e-model", { inputPerToken: 0.001, outputPerToken: 0.001 });

    const cp = new ControlPlane({
      model: "cp-e2e-model",
      authToken: "e2e-token",
      persistPath,
      telemetry: {
        exportSpans: () => [{ name: "collect" }, { name: "verify" }],
        exportMetrics: () => ({ totalSpans: 2 }),
      },
      approvals: {
        listPending: () => [{ id: "approval-1", tool: "delete" }],
      },
    });

    cp.setCostUsage({ inputTokens: 10, outputTokens: 5 });
    const { url } = await cp.startServer("127.0.0.1", 0);

    const unauthorized = await fetch(`${url}/api/snapshot`);
    expect(unauthorized.status).toBe(401);

    const snapshot = await fetch(`${url}/api/snapshot?token=e2e-token`);
    expect(snapshot.status).toBe(200);

    const timeline = await fetch(`${url}/api/timeline?token=e2e-token`);
    const timelineBody = await timeline.json() as Array<{ spanCount: number; pendingApprovalsCount: number }>;
    expect(timelineBody[timelineBody.length - 1].spanCount).toBe(2);
    expect(timelineBody[timelineBody.length - 1].pendingApprovalsCount).toBe(1);

    const dag = await fetch(`${url}/api/dag?token=e2e-token`);
    const dagBody = await dag.json() as { nodes: Array<unknown>; edges: Array<unknown> };
    expect(dagBody.nodes.length).toBe(2);
    expect(dagBody.edges.length).toBe(1);

    await cp.stopServer();
    clearPricing();

    expect(existsSync(persistPath)).toBe(true);
    const lines = readFileSync(persistPath, "utf8").trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    rmSync(persistPath, { force: true });
  });
});

