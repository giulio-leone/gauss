// =============================================================================
// Koa Server Adapter — Wraps Gauss agents as Koa HTTP endpoints
// =============================================================================

import type {
  ServerAdapterPort,
  AgentRouteHandler,
  AgentRequest,
  AgentResponse,
  ServerMiddleware,
} from "../../../ports/server.port.js";

export interface KoaServerConfig {
  app?: unknown;
}

export class KoaServerAdapter implements ServerAdapterPort {
  private app: unknown;
  private router: unknown;
  private server: unknown;
  private readonly middlewares: ServerMiddleware[] = [];

  constructor(options: { app?: unknown; config?: KoaServerConfig } = {}) {
    this.app = options.app ?? options.config?.app ?? null;
  }

  private async ensureApp(): Promise<{ app: any; router: any }> {
    if (!this.app) {
      const koaModule = await import("koa");
      const Koa = (koaModule as any).default ?? koaModule;
      this.app = new Koa();
    }
    if (!this.router) {
      const routerModule = await import("@koa/router");
      const Router = (routerModule as any).default ?? routerModule;
      this.router = new Router();
    }
    return { app: this.app, router: this.router };
  }

  registerAgent(path: string, handler: AgentRouteHandler): void {
    const middlewares = this.middlewares.slice();

    void this.ensureApp().then(({ router }) => {
      router.post(path, async (ctx: any) => {
        const agentReq: AgentRequest = {
          body: ctx.request.body ?? null,
          headers: Object.fromEntries(
            Object.entries(ctx.headers).map(([k, v]) => [k, String(v)]),
          ),
          params: ctx.params ?? {},
          query: ctx.query ?? {},
        };

        try {
          let response: AgentResponse;

          if (middlewares.length > 0) {
            response = await this.runMiddlewareChain(middlewares, agentReq, handler);
          } else {
            response = await handler(agentReq);
          }

          ctx.status = response.status;
          ctx.body = response.body;
          if (response.headers) {
            for (const [key, value] of Object.entries(response.headers)) {
              ctx.set(key, value);
            }
          }
        } catch {
          ctx.status = 500;
          ctx.body = { error: "Internal server error" };
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
    const { app, router } = await this.ensureApp();
    app.use(router.routes());
    app.use(router.allowedMethods());

    return new Promise<void>((resolve) => {
      this.server = app.listen(port, hostname ?? "0.0.0.0", () => resolve());
    });
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
