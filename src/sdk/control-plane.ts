/**
 * Unified Control Plane — local operational surface for Gauss.
 *
 * Provides a lightweight dashboard and JSON API for telemetry, approvals, and
 * cost visibility. Includes optional auth, persistence, filtering, and timeline
 * snapshots.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { dirname } from "node:path";

import { ValidationError } from "./errors.js";
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
  context: ControlPlaneContext;
  spans: unknown;
  metrics: unknown;
  pendingApprovals: unknown;
  latestCost: ReturnType<typeof estimateCost> | null;
}

export type ControlPlaneSection = "spans" | "metrics" | "pendingApprovals" | "latestCost";

export interface ControlPlaneContext {
  tenantId?: string;
  sessionId?: string;
  runId?: string;
}

export interface ControlPlaneOptions {
  telemetry?: Pick<Telemetry, "exportSpans" | "exportMetrics">;
  approvals?: Pick<ApprovalManager, "listPending">;
  model?: string;
  authToken?: string;
  persistPath?: string;
  historyLimit?: number;
  context?: ControlPlaneContext;
}

export interface ControlPlaneTimelinePoint {
  generatedAt: string;
  spanCount: number;
  pendingApprovalsCount: number;
  totalCostUsd: number;
}

export class ControlPlane implements Disposable {
  private readonly telemetry?: Pick<Telemetry, "exportSpans" | "exportMetrics">;
  private readonly approvals?: Pick<ApprovalManager, "listPending">;
  private model: string;
  private authToken?: string;
  private readonly persistPath?: string;
  private readonly historyLimit: number;
  private context: ControlPlaneContext;
  private latestCost: ReturnType<typeof estimateCost> | null = null;
  private readonly history: ControlPlaneSnapshot[] = [];
  private server: Server | null = null;

  constructor(options: ControlPlaneOptions = {}) {
    this.telemetry = options.telemetry;
    this.approvals = options.approvals;
    this.model = options.model ?? "gpt-5.2";
    this.authToken = options.authToken;
    this.persistPath = options.persistPath;
    this.historyLimit = options.historyLimit ?? 200;
    this.context = { ...(options.context ?? {}) };
  }

  withModel(model: string): this {
    this.model = model;
    return this;
  }

  withAuthToken(token?: string): this {
    this.authToken = token;
    return this;
  }

  withContext(context: ControlPlaneContext): this {
    this.context = { ...context };
    return this;
  }

  setCostUsage(usage: ControlPlaneUsage): this {
    this.latestCost = estimateCost(this.model, usage);
    return this;
  }

  snapshot(): ControlPlaneSnapshot;
  snapshot(section: ControlPlaneSection): Record<string, unknown>;
  snapshot(section?: ControlPlaneSection): ControlPlaneSnapshot | Record<string, unknown> {
    const full = this.captureSnapshot();
    if (!section) return full;
    return {
      generatedAt: full.generatedAt,
      context: full.context,
      [section]: full[section],
    };
  }

  getHistory(filters?: ControlPlaneContext): ControlPlaneSnapshot[] {
    return this.filterHistory(filters);
  }

  getTimeline(filters?: ControlPlaneContext): ControlPlaneTimelinePoint[] {
    return this.filterHistory(filters).map((item) => ({
      generatedAt: item.generatedAt,
      spanCount: Array.isArray(item.spans) ? item.spans.length : 0,
      pendingApprovalsCount: Array.isArray(item.pendingApprovals) ? item.pendingApprovals.length : 0,
      totalCostUsd: item.latestCost?.totalCostUsd ?? 0,
    }));
  }

  getDag(filters?: ControlPlaneContext): { nodes: Array<{ id: string; label: string }>; edges: Array<{ from: string; to: string }> } {
    const filtered = this.filterHistory(filters);
    const latest = filtered[filtered.length - 1];
    if (!latest || !Array.isArray(latest.spans)) {
      return { nodes: [], edges: [] };
    }
    const nodes = latest.spans.map((span, i) => ({
      id: String(i),
      label: this.spanLabel(span, i),
    }));
    const edges = nodes.slice(1).map((node, i) => ({
      from: String(i),
      to: node.id,
    }));
    return { nodes, edges };
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

      const parsed = new URL(req.url, `http://${req.headers.host ?? `${host}:${port}`}`);
      const pathname = parsed.pathname;

      if (pathname.startsWith("/api/") && !this.isAuthorized(req, parsed)) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      try {
        if (pathname === "/api/snapshot") {
          const section = parsed.searchParams.get("section");
          const payload = section
            ? this.snapshot(this.parseSection(section))
            : this.snapshot();
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(payload, null, 2));
          return;
        }

        if (pathname === "/api/history") {
          const filters = this.parseContextFilters(parsed.searchParams);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(this.getHistory(filters), null, 2));
          return;
        }

        if (pathname === "/api/timeline") {
          const filters = this.parseContextFilters(parsed.searchParams);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(this.getTimeline(filters), null, 2));
          return;
        }

        if (pathname === "/api/dag") {
          const filters = this.parseContextFilters(parsed.searchParams);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(this.getDag(filters), null, 2));
          return;
        }

        if (pathname === "/") {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(this.renderDashboardHtml());
          return;
        }

        res.statusCode = 404;
        res.end("Not found");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Internal error";
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: message }));
      }
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

  private captureSnapshot(): ControlPlaneSnapshot {
    const snapshot: ControlPlaneSnapshot = {
      generatedAt: new Date().toISOString(),
      context: { ...this.context },
      spans: this.telemetry?.exportSpans() ?? [],
      metrics: this.telemetry?.exportMetrics() ?? {},
      pendingApprovals: this.approvals?.listPending() ?? [],
      latestCost: this.latestCost,
    };
    this.history.push(snapshot);
    if (this.history.length > this.historyLimit) {
      this.history.shift();
    }
    if (this.persistPath) {
      mkdirSync(dirname(this.persistPath), { recursive: true });
      appendFileSync(this.persistPath, `${JSON.stringify(snapshot)}\n`, "utf8");
    }
    return snapshot;
  }

  private parseSection(section: string): ControlPlaneSection {
    if (
      section === "spans" ||
      section === "metrics" ||
      section === "pendingApprovals" ||
      section === "latestCost"
    ) {
      return section;
    }
    throw new ValidationError(`Unknown section "${section}"`, "section");
  }

  private parseContextFilters(params: URLSearchParams): ControlPlaneContext {
    return {
      tenantId: params.get("tenant") ?? undefined,
      sessionId: params.get("session") ?? undefined,
      runId: params.get("run") ?? undefined,
    };
  }

  private filterHistory(filters?: ControlPlaneContext): ControlPlaneSnapshot[] {
    if (!filters || (!filters.tenantId && !filters.sessionId && !filters.runId)) {
      return [...this.history];
    }
    return this.history.filter((item) => this.matchesContext(item.context, filters));
  }

  private matchesContext(context: ControlPlaneContext, filters: ControlPlaneContext): boolean {
    if (filters.tenantId && context.tenantId !== filters.tenantId) return false;
    if (filters.sessionId && context.sessionId !== filters.sessionId) return false;
    if (filters.runId && context.runId !== filters.runId) return false;
    return true;
  }

  private spanLabel(span: unknown, index: number): string {
    if (span && typeof span === "object") {
      const rec = span as Record<string, unknown>;
      if (typeof rec.name === "string") return rec.name;
      if (typeof rec.span_name === "string") return rec.span_name;
    }
    return `span-${index + 1}`;
  }

  private isAuthorized(req: IncomingMessage, parsed: URL): boolean {
    if (!this.authToken) return true;
    const authHeader = req.headers.authorization;
    const bearer = typeof authHeader === "string" && authHeader === `Bearer ${this.authToken}`;
    const tokenHeader = req.headers["x-gauss-token"];
    const xToken = typeof tokenHeader === "string" && tokenHeader === this.authToken;
    const queryToken = parsed.searchParams.get("token") === this.authToken;
    return bearer || xToken || queryToken;
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
  <div class="muted">Live snapshot refreshes every 2s • filter: <code>?section=metrics</code> • auth via <code>?token=...</code></div>
  <pre id="out">loading...</pre>
  <script>
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const section = params.get('section');
    const qs = new URLSearchParams();
    if (token) qs.set('token', token);
    if (section) qs.set('section', section);
    async function refresh() {
      const target = '/api/snapshot' + (qs.toString() ? ('?' + qs.toString()) : '');
      const r = await fetch(target);
      if (!r.ok) {
        document.getElementById('out').textContent = 'HTTP ' + r.status + ': ' + await r.text();
        return;
      }
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
