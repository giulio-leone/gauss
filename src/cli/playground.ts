// =============================================================================
// Playground CLI — Programmatic launcher for Gauss Playground
// =============================================================================

import { NodeHttpServer } from "../server/node-http.server.js";
import { registerPlaygroundRoutes } from "../server/playground-api.js";
import type { PlaygroundAgent } from "../server/playground-api.js";

export interface PlaygroundOptions {
  port?: number;
  agents: PlaygroundAgent[];
  /** Open browser automatically (default: true) */
  open?: boolean;
}

/**
 * Start the Gauss Playground server.
 *
 * Usage:
 * ```ts
 * import { startPlayground } from "gauss";
 *
 * await startPlayground({
 *   port: 4000,
 *   agents: [{
 *     name: "my-agent",
 *     description: "A helpful assistant",
 *     invoke: async (prompt) => `Echo: ${prompt}`,
 *   }],
 * });
 * ```
 */
export async function startPlayground(options: PlaygroundOptions): Promise<{
  server: NodeHttpServer;
  url: string;
  close: () => Promise<void>;
}> {
  const port = options.port ?? 4000;
  const server = new NodeHttpServer();

  // Register playground API routes
  registerPlaygroundRoutes({
    server,
    agents: options.agents,
  });

  // CORS middleware for playground dev server
  server.use(async (_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    await next();
  });

  await server.listen(port);
  const url = `http://localhost:${port}`;

  console.log(`\n  ⚡ Gauss Playground running at ${url}`);
  console.log(`  📡 API:  ${url}/api/agents`);
  console.log(`  🎮 UI:   Run 'cd packages/playground && npm run dev' for the React UI\n`);

  if (options.open !== false) {
    try {
      const { exec } = await import("node:child_process");
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${cmd} ${url}`);
    } catch {
      // Ignore — opening browser is best-effort
    }
  }

  return {
    server,
    url,
    close: () => server.close(),
  };
}
