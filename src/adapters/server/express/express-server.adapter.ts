// =============================================================================
// Express Server Adapter — Wraps Gauss agents as Express HTTP endpoints
// =============================================================================

import type {
  ServerAdapterPort,
  AgentRouteHandler,
  AgentRequest,
  AgentResponse,
  ServerMiddleware,
} from "../../../ports/server.port.js";

export interface ExpressServerConfig {
  app?: unknown;
}

export class ExpressServerAdapter implements ServerAdapterPort {
  private app: unknown;
  private server: unknown;
  private readonly middlewares: ServerMiddleware[] = [];

  constructor(options: { app?: unknown; config?: ExpressServerConfig } = {}) {
    this.app = options.app ?? options.config?.app ?? null;
  }

  private async ensureApp(): Promise<any> {
    if (!this.app) {
      const express = await import("express");
      const createApp = (express as any).default ?? express;
      this.app = createApp();
      (this.app as any).use(createApp.json());
    }
    return this.app;
  }

  registerAgent(path: string, handler: AgentRouteHandler): void {
    const middlewares = this.middlewares.slice();

    const wrappedHandler = async (req: any, res: any) => {
      const agentReq: AgentRequest = {
        body: req.body,
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, String(v)]),
        ),
        params: req.params ?? {},
        query: req.query ?? {},
      };

      try {
        let response: AgentResponse;

        if (middlewares.length > 0) {
          response = await this.runMiddlewareChain(middlewares, agentReq, handler);
        } else {
          response = await handler(agentReq);
        }

        if (response.headers) {
          for (const [key, value] of Object.entries(response.headers)) {
            res.set(key, value);
          }
        }
        res.status(response.status).json(response.body);
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    };

    // Eagerly set up route — ensureApp is called at listen/handler time
    void this.ensureApp().then((app) => app.post(path, wrappedHandler));
  }

  use(middleware: ServerMiddleware): void {
    this.middlewares.push(middleware);
  }

  handler(): unknown {
    return this.app;
  }

  async listen(port: number, hostname?: string): Promise<void> {
    const app = await this.ensureApp();
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
