// =============================================================================
// Fastify Server Adapter — Wraps Gauss agents as Fastify HTTP endpoints
// =============================================================================

import type {
  ServerAdapterPort,
  AgentRouteHandler,
  AgentRequest,
  AgentResponse,
  ServerMiddleware,
} from "../../../ports/server.port.js";

export interface FastifyServerConfig {
  server?: unknown;
  logger?: boolean;
}

export class FastifyServerAdapter implements ServerAdapterPort {
  private server: unknown;
  private readonly config: FastifyServerConfig;
  private readonly middlewares: ServerMiddleware[] = [];

  constructor(options: { app?: unknown; config?: FastifyServerConfig } = {}) {
    this.config = options.config ?? {};
    this.server = options.app ?? this.config.server ?? null;
  }

  private async ensureServer(): Promise<any> {
    if (!this.server) {
      const fastifyModule = await import("fastify");
      const createFastify = (fastifyModule as any).default ?? fastifyModule;
      this.server = createFastify({ logger: this.config.logger ?? false });
    }
    return this.server;
  }

  registerAgent(path: string, handler: AgentRouteHandler): void {
    const middlewares = this.middlewares.slice();

    void this.ensureServer().then((fastify) => {
      fastify.post(path, async (request: any, reply: any) => {
        const agentReq: AgentRequest = {
          body: request.body,
          headers: Object.fromEntries(
            Object.entries(request.headers).map(([k, v]) => [k, String(v)]),
          ),
          params: (request.params as Record<string, string>) ?? {},
          query: (request.query as Record<string, string>) ?? {},
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
              void reply.header(key, value);
            }
          }
          return reply.status(response.status).send(response.body);
        } catch {
          return reply.status(500).send({ error: "Internal server error" });
        }
      });
    });
  }

  use(middleware: ServerMiddleware): void {
    this.middlewares.push(middleware);
  }

  handler(): unknown {
    return this.server;
  }

  async listen(port: number, hostname?: string): Promise<void> {
    const fastify = await this.ensureServer();
    await fastify.listen({ port, host: hostname ?? "0.0.0.0" });
  }

  async close(): Promise<void> {
    if (this.server && typeof (this.server as any).close === "function") {
      await (this.server as any).close();
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
