// =============================================================================
// PlaygroundAPI — REST endpoints for the GaussFlow Playground
// =============================================================================

import type { HttpServerPort } from "../ports/http-server.port.js";

export interface PlaygroundAgent {
  name: string;
  description?: string;
  /** Function to invoke the agent with a prompt and return the response text */
  invoke: (prompt: string, options?: { stream?: boolean }) => Promise<string | AsyncIterable<string>>;
}

export interface PlaygroundConfig {
  server: HttpServerPort;
  agents: PlaygroundAgent[];
  /** Static file directory for the playground UI (optional) */
  staticDir?: string;
}

interface HistoryEntry {
  id: string;
  agentName: string;
  prompt: string;
  response: string;
  timestamp: number;
  durationMs: number;
}

/**
 * Registers playground REST endpoints on the given HTTP server.
 *
 * Endpoints:
 * - GET  /api/agents                — List all registered agents
 * - POST /api/agents/:name/run      — Run agent with { prompt }
 * - GET  /api/agents/:name/stream   — SSE stream agent response (query: prompt)
 * - GET  /api/agents/:name/history  — Get agent run history
 * - GET  /api/health                — Health check
 */
export function registerPlaygroundRoutes(config: PlaygroundConfig): void {
  const { server, agents } = config;
  const agentMap = new Map(agents.map((a) => [a.name, a]));
  const history: HistoryEntry[] = [];
  let idCounter = 0;

  // GET /api/agents
  server.route("GET", "/api/agents", async (_req, res) => {
    res.json(agents.map((a) => ({ name: a.name, description: a.description ?? "" })));
  });

  // POST /api/agents/:name/run
  server.route("POST", "/api/agents/:name/run", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) {
      res.status(404).json({ error: `Agent "${req.params.name}" not found` });
      return;
    }

    const body = req.body as { prompt?: string } | undefined;
    if (!body?.prompt) {
      res.status(400).json({ error: "Missing 'prompt' in request body" });
      return;
    }

    const start = Date.now();
    try {
      const result = await agent.invoke(body.prompt);
      const response = typeof result === "string" ? result : "";
      const durationMs = Date.now() - start;

      const entry: HistoryEntry = {
        id: `run-${++idCounter}`,
        agentName: agent.name,
        prompt: body.prompt,
        response,
        timestamp: start,
        durationMs,
      };
      history.push(entry);

      res.json({ id: entry.id, response, durationMs });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/agents/:name/stream
  server.route("GET", "/api/agents/:name/stream", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) {
      res.status(404).json({ error: `Agent "${req.params.name}" not found` });
      return;
    }

    const prompt = req.query.prompt;
    if (!prompt) {
      res.status(400).json({ error: "Missing 'prompt' query parameter" });
      return;
    }

    try {
      const result = await agent.invoke(prompt, { stream: true });
      if (typeof result === "string") {
        const text = result;
        async function* singleChunk(): AsyncGenerator<string> { yield text; }
        res.header("Cache-Control", "no-cache").header("Connection", "keep-alive").stream(singleChunk());
      } else {
        async function* streamChunks() {
          for await (const chunk of result as AsyncIterable<string>) {
            yield chunk;
          }
        }
        res.header("Cache-Control", "no-cache").header("Connection", "keep-alive").stream(streamChunks());
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/agents/:name/history
  server.route("GET", "/api/agents/:name/history", async (req, res) => {
    const agentHistory = history.filter((h) => h.agentName === req.params.name);
    res.json(agentHistory);
  });

  // GET /api/health
  server.route("GET", "/api/health", async (_req, res) => {
    res.json({ status: "ok", agents: agents.length, uptime: process.uptime() });
  });
}
