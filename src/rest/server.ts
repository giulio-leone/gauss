// =============================================================================
// REST API — GaussServer (zero-dependency HTTP server using node:http)
// =============================================================================

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerOptions } from "./types.js";
import { Router, sendError, sendJson } from "./router.js";
import {
  handleHealth,
  handleInfo,
  handleRun,
  handleStream,
  handleGraphRun,
  handleAgentHealth,
} from "./handlers.js";
import { Agent } from "../agent/agent.js";

export class GaussServer {
  private readonly options: Required<ServerOptions>;
  private readonly router: Router;
  private server: Server | null = null;
  private agent?: Agent;

  constructor(options?: ServerOptions, agent?: Agent) {
    this.options = {
      port: options?.port ?? 3456,
      apiKey: options?.apiKey ?? "",
      defaultProvider: options?.defaultProvider ?? "openai",
      defaultModel: options?.defaultModel ?? "gpt-5.2",
      cors: options?.cors ?? true,
    };

    this.agent = agent;
    this.router = new Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    const opts = this.options;

    // Public endpoints
    this.router.get("/api/health", handleHealth);
    this.router.get("/api/info", handleInfo(opts));
    
    // Agent health endpoint (if agent is provided)
    if (this.agent) {
      this.router.get("/health", handleAgentHealth(this.agent));
    }

    // Protected endpoints
    this.router.post("/api/run", handleRun(opts));
    this.router.post("/api/stream", handleStream(opts));
    this.router.post("/api/graph/run", handleGraphRun(opts));

    // CORS preflight for all API routes
    if (opts.cors) {
      const corsHandler = (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(204);
        res.end();
      };
      this.router.options("/api/run", corsHandler);
      this.router.options("/api/stream", corsHandler);
      this.router.options("/api/graph/run", corsHandler);
      this.router.options("/api/health", corsHandler);
      this.router.options("/api/info", corsHandler);
      if (this.agent) {
        this.router.options("/health", corsHandler);
      }
    }
  }

  private addCorsHeaders(res: ServerResponse): void {
    if (!this.options.cors) return;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  private authenticate(req: IncomingMessage, pathname: string): boolean {
    // Health endpoints are always public
    if (pathname === "/api/health" || pathname === "/health") return true;
    // If no API key configured, auth is disabled
    if (!this.options.apiKey) return true;

    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const [scheme, token] = authHeader.split(" ");
    return scheme === "Bearer" && token === this.options.apiKey;
  }

  private handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    this.addCorsHeaders(res);

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method?.toUpperCase() ?? "GET";
    const pathname = url.pathname;

    // Auth check
    if (!this.authenticate(req, pathname)) {
      return sendError(res, 401, "Unauthorized: invalid or missing API key");
    }

    // Route
    const match = this.router.resolve(method, pathname);
    if (!match) {
      return sendError(res, 404, `Not found: ${method} ${pathname}`);
    }

    try {
      await match.handler(req, res, match.params);
    } catch (err) {
      if (!res.headersSent) {
        sendError(res, 500, err instanceof Error ? err.message : String(err));
      }
    }
  };

  async listen(port?: number): Promise<void> {
    if (this.agent) {
      await this.agent.startup();
    }
    const p = port ?? this.options.port;
    await new Promise<void>((resolve, reject) => {
      this.server = createServer(this.handleRequest);
      this.server.on("error", reject);
      this.server.listen(p, () => resolve());
    });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
    if (this.agent) {
      await this.agent.shutdown();
    }
  }
}
