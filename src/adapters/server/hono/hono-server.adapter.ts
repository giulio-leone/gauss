// =============================================================================
// Hono Server Adapter — Wraps Gauss agents as Hono HTTP endpoints
// =============================================================================

import type {
  ServerAdapterPort,
  AgentRouteHandler,
  AgentRequest,
  AgentResponse,
  ServerMiddleware,
} from "../../../ports/server.port.js";

export interface HonoServerConfig {
  app?: unknown;
}

export class HonoServerAdapter implements ServerAdapterPort {
  private app: unknown;
  private server: unknown;
  private readonly middlewares: ServerMiddleware[] = [];

  constructor(options: { app?: unknown; config?: HonoServerConfig } = {}) {
    this.app = options.app ?? options.config?.app ?? null;
  }

  private async ensureApp(): Promise<any> {
    if (!this.app) {
      const honoModule = await import("hono");
      const Hono = (honoModule as any).Hono ?? (honoModule as any).default?.Hono;
      this.app = new Hono();
    }
    return this.app;
  }

  registerAgent(path: string, handler: AgentRouteHandler): void {
    const middlewares = this.middlewares.slice();

    void this.ensureApp().then((app) => {
      app.post(path, async (c: any) => {
        const agentReq: AgentRequest = {
          body: await c.req.json().catch(() => null),
          headers: Object.fromEntries(
            [...(c.req.raw?.headers?.entries?.() ?? [])].map(([k, v]: [string, string]) => [k, v]),
          ),
          params: c.req.param() ?? {},
          query: c.req.query() ?? {},
        };

        try {
          let response: AgentResponse;

          if (middlewares.length > 0) {
            response = await this.runMiddlewareChain(middlewares, agentReq, handler);
          } else {
            response = await handler(agentReq);
          }

          const headers = new Headers(response.headers ?? {});
          headers.set("content-type", "application/json");

          return c.json(response.body, response.status, Object.fromEntries(headers.entries()));
        } catch {
          return c.json({ error: "Internal server error" }, 500);
        }
      });
    });
  }

  use(middleware: ServerMiddleware): void {
    this.middlewares.push(middleware);
  }

  handler(): unknown {
    return this.app;
  }

  async listen(port: number, hostname?: string): Promise<void> {
    const app = await this.ensureApp();
    const { serve } = await import("@hono/node-server");
    this.server = serve({ fetch: app.fetch, port, hostname: hostname ?? "0.0.0.0" });
  }

  async close(): Promise<void> {
    if (this.server && typeof (this.server as any).close === "function") {
      return new Promise<void>((resolve, reject) => {
        (this.server as any).close((err: Error | undefined) =>
          err ? reject(err) : resolve(),
        );
      });
    }
  }

  private async runMiddlewareChain(
    middlewares: ServerMiddleware[],
    req: AgentRequest,
    handler: AgentRouteHandler,
  ): Promise<AgentResponse> {
    let index = 0;

    const next = async (): Promise<AgentResponse> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++];
        return mw(req, next);
      }
      return handler(req);
    };

    return next();
  }
}
