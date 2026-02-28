// =============================================================================
// REST API — Request Handlers
// =============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ServerOptions,
  RunRequest,
  GraphRunRequest,
  HealthResponse,
  InfoResponse,
} from "./types.js";
import { parseBody, sendJson, sendError } from "./router.js";
import { Agent } from "../agent/agent.js";
import { AgentGraph } from "../graph/agent-graph.js";
import type { LanguageModel } from "../core/llm/index.js";

const VERSION = "0.1.0";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Provider resolution (same dynamic import pattern as CLI)
// ---------------------------------------------------------------------------

async function resolveModel(
  provider: string,
  modelId: string,
  requestApiKey?: string,
): Promise<LanguageModel> {
  const { createModel, isValidProvider } = await import(
    "../cli/providers.js"
  );
  if (!isValidProvider(provider)) {
    throw new Error(`Unsupported provider: "${provider}"`);
  }

  const { envVarName } = await import("../cli/config.js");
  const apiKey = requestApiKey ?? process.env[envVarName(provider)] ?? "";
  return createModel(provider as Parameters<typeof createModel>[0], apiKey, modelId);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  const body: HealthResponse = { status: "ok", version: VERSION };
  sendJson(res, 200, body);
}

// ---------------------------------------------------------------------------
// Info
// ---------------------------------------------------------------------------

export function handleInfo(
  options: ServerOptions,
): (_req: IncomingMessage, res: ServerResponse) => void {
  return (_req, res) => {
    const body: InfoResponse = {
      version: VERSION,
      defaultProvider: options.defaultProvider ?? "openai",
      defaultModel: options.defaultModel ?? "gpt-5.2",
      endpoints: [
        "POST /api/run",
        "POST /api/stream",
        "POST /api/graph/run",
        "GET  /api/health",
        "GET  /api/info",
      ],
    };
    sendJson(res, 200, body);
  };
}

// ---------------------------------------------------------------------------
// GET /health (Agent Health Check)
// ---------------------------------------------------------------------------

export function handleAgentHealth(
  agent: Agent,
): (_req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (_req, res) => {
    try {
      const healthStatus = await agent.healthCheck();
      const statusCode = healthStatus.healthy ? 200 : 503;
      sendJson(res, statusCode, healthStatus);
    } catch (err) {
      sendError(res, 500, errorMessage(err));
    }
  };
}

// ---------------------------------------------------------------------------
// POST /api/run
// ---------------------------------------------------------------------------

export function handleRun(
  options: ServerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    let body: RunRequest;
    try {
      const raw = await parseBody(req);
      body = JSON.parse(raw) as RunRequest;
    } catch {
      return sendError(res, 400, "Invalid JSON body");
    }

    if (!body.prompt || typeof body.prompt !== "string") {
      return sendError(res, 400, "Missing required field: prompt");
    }

    const provider = body.provider ?? options.defaultProvider ?? "openai";
    const modelId = body.model ?? options.defaultModel ?? "gpt-5.2";

    let model: LanguageModel;
    try {
      model = await resolveModel(provider, modelId, body.apiKey);
    } catch (err) {
      return sendError(res, 400, errorMessage(err));
    }

    const start = Date.now();
    const agent = Agent.auto({
      instructions: body.instructions ?? "You are a helpful assistant.",
      model,
      maxSteps: body.maxSteps ?? 10,
    });

    try {
      const result = await agent.run(body.prompt);
      const duration = Date.now() - start;

      sendJson(res, 200, {
        text: result.text,
        sessionId: result.sessionId,
        steps: result.steps.length,
        duration,
      });
    } catch (err) {
      return sendError(res, 500, errorMessage(err));
    } finally {
      await agent.dispose();
    }
  };
}

// ---------------------------------------------------------------------------
// POST /api/stream
// ---------------------------------------------------------------------------

export function handleStream(
  options: ServerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    let body: RunRequest;
    try {
      const raw = await parseBody(req);
      body = JSON.parse(raw) as RunRequest;
    } catch {
      return sendError(res, 400, "Invalid JSON body");
    }

    if (!body.prompt || typeof body.prompt !== "string") {
      return sendError(res, 400, "Missing required field: prompt");
    }

    const provider = body.provider ?? options.defaultProvider ?? "openai";
    const modelId = body.model ?? options.defaultModel ?? "gpt-5.2";

    let model: LanguageModel;
    try {
      model = await resolveModel(provider, modelId, body.apiKey);
    } catch (err) {
      return sendError(res, 400, errorMessage(err));
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const agent = Agent.auto({
      instructions: body.instructions ?? "You are a helpful assistant.",
      model,
      maxSteps: body.maxSteps ?? 10,
    });

    try {
      const streamResult = await agent.stream({
        messages: [{ role: "user", content: body.prompt }],
      });

      // Consume the text stream
      const reader = streamResult.textStream.getReader();
      const chunks: string[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        const event = JSON.stringify({ type: "token", content: value });
        res.write(`data: ${event}\n\n`);
      }

      const fullText = chunks.join("");
      const doneEvent = JSON.stringify({
        type: "done",
        text: fullText,
        sessionId: agent.sessionId,
      });
      res.write(`data: ${doneEvent}\n\n`);
      res.end();
    } catch (err) {
      const errEvent = JSON.stringify({
        type: "error",
        error: errorMessage(err),
      });
      res.write(`data: ${errEvent}\n\n`);
      res.end();
    } finally {
      await agent.dispose();
    }
  };
}

// ---------------------------------------------------------------------------
// POST /api/graph/run
// ---------------------------------------------------------------------------

export function handleGraphRun(
  options: ServerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    let body: GraphRunRequest;
    try {
      const raw = await parseBody(req);
      body = JSON.parse(raw) as GraphRunRequest;
    } catch {
      return sendError(res, 400, "Invalid JSON body");
    }

    if (!body.prompt || typeof body.prompt !== "string") {
      return sendError(res, 400, "Missing required field: prompt");
    }
    if (!body.nodes || !Array.isArray(body.nodes) || body.nodes.length === 0) {
      return sendError(res, 400, "Missing required field: nodes");
    }

    const defaultProvider = body.provider ?? options.defaultProvider ?? "openai";
    const defaultModelId = body.model ?? options.defaultModel ?? "gpt-5.2";

    const start = Date.now();
    try {
      const builder = AgentGraph.create();

      for (const nodeDef of body.nodes) {
        const nodeProvider = nodeDef.provider ?? defaultProvider;
        const nodeModelId = nodeDef.model ?? defaultModelId;
        const model = await resolveModel(nodeProvider, nodeModelId, body.apiKey);
        builder.node(nodeDef.id, {
          instructions: nodeDef.instructions,
          model,
        });
      }

      if (body.edges) {
        for (const edge of body.edges) {
          builder.edge(edge.from, edge.to);
        }
      }

      const graph = builder.build();
      const result = await graph.run(body.prompt);
      const duration = Date.now() - start;

      sendJson(res, 200, {
        results: Object.fromEntries(
          Object.entries(result.nodeResults).map(([k, v]) => [k, v.output]),
        ),
        duration,
      });
    } catch (err) {
      return sendError(res, 500, errorMessage(err));
    }
  };
}
