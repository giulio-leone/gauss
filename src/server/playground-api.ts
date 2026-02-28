// =============================================================================
// PlaygroundAPI — REST endpoints for the Gauss Playground
// =============================================================================

import type { HttpServerPort } from "../ports/http-server.port.js";

export interface PlaygroundTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface PlaygroundMemoryEntry {
  key: string;
  value: unknown;
  tier: "short" | "working" | "semantic" | "observation";
  timestamp: number;
}

export interface PlaygroundGraphData {
  nodes: Array<{ id: string; type: string; label: string; properties: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string; type: string; weight: number }>;
}

export interface PlaygroundAgent {
  name: string;
  description?: string;
  invoke: (prompt: string, options?: { stream?: boolean }) => Promise<string | AsyncIterable<string>>;
  /** Registered tools (for ToolInspector) */
  tools?: PlaygroundTool[];
  /** Memory provider (for MemoryViewer) */
  getMemory?: () => Promise<PlaygroundMemoryEntry[]>;
  /** Knowledge graph provider (for GraphVisualizer) */
  getGraph?: () => Promise<PlaygroundGraphData>;
  /** Trace provider (for TraceViewer) */
  getTraces?: () => Promise<PlaygroundTraceSpan[]>;
  /** Token usage provider (for TokenDashboard) */
  getTokenUsage?: () => Promise<PlaygroundTokenUsage[]>;
  /** Tool call history (for ToolCallInspector) */
  getToolCalls?: () => Promise<PlaygroundToolCall[]>;
  /** Reliability metrics (for RetryDashboard) */
  getReliabilityMetrics?: () => Promise<PlaygroundReliabilityMetrics>;
}

// ─── Trace Viewer Types ────────────────────────────────────────────────────────

export interface PlaygroundTraceSpan {
  id: string;
  name: string;
  parentId?: string;
  startTime: number;
  endTime: number;
  status: "ok" | "error";
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

// ─── Token Dashboard Types ─────────────────────────────────────────────────────

export interface PlaygroundTokenUsage {
  runId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  timestamp: number;
}

// ─── Tool Call Inspector Types ─────────────────────────────────────────────────

export interface PlaygroundToolCall {
  id: string;
  runId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  status: "success" | "error";
  error?: string;
  timestamp: number;
}

// ─── Reliability Dashboard Types ───────────────────────────────────────────────

export interface PlaygroundReliabilityMetrics {
  circuitBreaker: {
    state: "closed" | "open" | "half-open";
    failureCount: number;
    successCount: number;
    lastFailure?: number;
    lastStateChange: number;
  };
  retries: {
    totalAttempts: number;
    successfulRetries: number;
    failedRetries: number;
    recentRetries: Array<{ toolName: string; attempts: number; success: boolean; timestamp: number }>;
  };
  rateLimiter: {
    remainingTokens: number;
    maxTokens: number;
    requestsThisWindow: number;
  };
}

export interface PlaygroundConfig {
  server: HttpServerPort;
  agents: PlaygroundAgent[];
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

  // GET /api/agents/:name/tools — List agent tools
  server.route("GET", "/api/agents/:name/tools", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) { res.status(404).json({ error: `Agent "${req.params.name}" not found` }); return; }
    res.json(agent.tools ?? []);
  });

  // GET /api/agents/:name/memory — Get agent memory state
  server.route("GET", "/api/agents/:name/memory", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) { res.status(404).json({ error: `Agent "${req.params.name}" not found` }); return; }
    if (!agent.getMemory) { res.json([]); return; }
    try {
      const memory = await agent.getMemory();
      res.json(memory);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/agents/:name/graph — Get agent knowledge graph
  server.route("GET", "/api/agents/:name/graph", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) { res.status(404).json({ error: `Agent "${req.params.name}" not found` }); return; }
    if (!agent.getGraph) { res.json({ nodes: [], edges: [] }); return; }
    try {
      const graph = await agent.getGraph();
      res.json(graph);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/agents/:name/traces — Get execution traces
  server.route("GET", "/api/agents/:name/traces", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) { res.status(404).json({ error: `Agent "${req.params.name}" not found` }); return; }
    if (!agent.getTraces) { res.json([]); return; }
    try {
      res.json(await agent.getTraces());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/agents/:name/tokens — Get token usage metrics
  server.route("GET", "/api/agents/:name/tokens", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) { res.status(404).json({ error: `Agent "${req.params.name}" not found` }); return; }
    if (!agent.getTokenUsage) { res.json([]); return; }
    try {
      res.json(await agent.getTokenUsage());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/agents/:name/tool-calls — Get tool call history with I/O
  server.route("GET", "/api/agents/:name/tool-calls", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) { res.status(404).json({ error: `Agent "${req.params.name}" not found` }); return; }
    if (!agent.getToolCalls) { res.json([]); return; }
    try {
      res.json(await agent.getToolCalls());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/agents/:name/reliability — Get retry/circuit breaker metrics
  server.route("GET", "/api/agents/:name/reliability", async (req, res) => {
    const agent = agentMap.get(req.params.name);
    if (!agent) { res.status(404).json({ error: `Agent "${req.params.name}" not found` }); return; }
    if (!agent.getReliabilityMetrics) {
      res.json({
        circuitBreaker: { state: "closed", failureCount: 0, successCount: 0, lastStateChange: Date.now() },
        retries: { totalAttempts: 0, successfulRetries: 0, failedRetries: 0, recentRetries: [] },
        rateLimiter: { remainingTokens: 0, maxTokens: 0, requestsThisWindow: 0 },
      });
      return;
    }
    try {
      res.json(await agent.getReliabilityMetrics());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/health
  server.route("GET", "/api/health", async (_req, res) => {
    res.json({ status: "ok", agents: agents.length, uptime: process.uptime() });
  });
}
