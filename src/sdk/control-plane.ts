/**
 * Unified Control Plane — lightweight local ops dashboard for Gauss.
 *
 * Aggregates telemetry, approvals, and cost snapshots behind a tiny local HTTP
 * server to provide a single operational surface for debugging and governance.
 */
import { createServer, type Server } from "node:http";

import type { Disposable } from "./types.js";
import type { Telemetry } from "./telemetry.js";
import type { ApprovalManager } from "./approval.js";
import { estimateCost } from "./tokens.js";

export interface ControlPlaneUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface ControlPlaneSnapshot {
  generatedAt: string;
  spans: unknown;
  metrics: unknown;
  pendingApprovals: unknown;
  latestCost: ReturnType<typeof estimateCost> | null;
}

export interface ControlPlaneOptions {
  telemetry?: Pick<Telemetry, "exportSpans" | "exportMetrics">;
  approvals?: Pick<ApprovalManager, "listPending">;
  model?: string;
}

export class ControlPlane implements Disposable {
  private readonly telemetry?: Pick<Telemetry, "exportSpans" | "exportMetrics">;
  private readonly approvals?: Pick<ApprovalManager, "listPending">;
  private model: string;
  private latestCost: ReturnType<typeof estimateCost> | null = null;
  private server: Server | null = null;

  constructor(options: ControlPlaneOptions = {}) {
    this.telemetry = options.telemetry;
    this.approvals = options.approvals;
    this.model = options.model ?? "gpt-5.2";
  }

  withModel(model: string): this {
    this.model = model;
    return this;
  }

  setCostUsage(usage: ControlPlaneUsage): this {
    this.latestCost = estimateCost(this.model, usage);
    return this;
  }

  snapshot(): ControlPlaneSnapshot {
    return {
      generatedAt: new Date().toISOString(),
      spans: this.telemetry?.exportSpans() ?? [],
      metrics: this.telemetry?.exportMetrics() ?? {},
      pendingApprovals: this.approvals?.listPending() ?? [],
      latestCost: this.latestCost,
    };
  }

  async startServer(host = "127.0.0.1", port = 4200): Promise<{ url: string }> {
    if (this.server) {
      const addr = this.server.address();
      if (addr && typeof addr !== "string") {
        return { url: `http://${host}:${addr.port}` };
      }
      return { url: `http://${host}:${port}` };
    }

    this.server = createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Bad request");
        return;
      }

      if (req.url === "/api/snapshot") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(this.snapshot(), null, 2));
        return;
      }

      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(this.renderDashboardHtml());
        return;
      }

      res.statusCode = 404;
      res.end("Not found");
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, host, () => resolve());
    });

    const addr = this.server.address();
    if (!addr || typeof addr === "string") {
      return { url: `http://${host}:${port}` };
    }
    return { url: `http://${host}:${addr.port}` };
  }

  async stopServer(): Promise<void> {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      srv.close((err) => (err ? reject(err) : resolve()));
    });
  }

  destroy(): void {
    void this.stopServer();
  }

  [Symbol.dispose](): void {
    this.destroy();
  }

  private renderDashboardHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gauss Control Plane</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin: 24px; background: #0b1020; color: #f5f7ff; }
    h1 { margin-top: 0; }
    .muted { color: #a9b4d0; margin-bottom: 12px; }
    pre { background: #111935; border: 1px solid #25315f; padding: 16px; border-radius: 8px; overflow: auto; max-height: 70vh; }
  </style>
</head>
<body>
  <h1>Gauss Control Plane</h1>
  <div class="muted">Live snapshot refreshes every 2s</div>
  <pre id="out">loading...</pre>
  <script>
    async function refresh() {
      const r = await fetch('/api/snapshot');
      const j = await r.json();
      document.getElementById('out').textContent = JSON.stringify(j, null, 2);
    }
    setInterval(refresh, 2000);
    refresh();
  </script>
</body>
</html>`;
  }
}

