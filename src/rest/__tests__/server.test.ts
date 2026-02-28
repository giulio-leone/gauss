// =============================================================================
// REST API — Tests
// =============================================================================

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { Router, parseBody, sendJson, sendError } from "../router.js";
import { GaussServer } from "../server.js";

// =============================================================================
// Mock Agent and CLI providers — prevent real AI calls
// =============================================================================

vi.mock("../../agent/agent.js", () => {
  const disposeFn = vi.fn().mockResolvedValue(undefined);
  const runFn = vi.fn().mockResolvedValue({
    text: "Mock AI response",
    steps: [{ type: "text" }],
    sessionId: "mock-session-id",
  });

  // Mock textStream as a ReadableStream
  const streamFn = vi.fn().mockResolvedValue({
    textStream: new ReadableStream({
      start(controller) {
        controller.enqueue("Hello");
        controller.enqueue(" World");
        controller.close();
      },
    }),
  });

  class MockAgent {
    sessionId = "mock-session-id";
    run = runFn;
    stream = streamFn;
    dispose = disposeFn;

    static auto() {
      return new MockAgent();
    }
    static create() {
      return { withPlanning: () => ({ build: () => new MockAgent() }) };
    }
  }

  return {
    Agent: MockAgent,
    AgentBuilder: class {},
    __mockRunFn: runFn,
    __mockDisposeFn: disposeFn,
  };
});

vi.mock("../../graph/agent-graph.js", () => {
  const runFn = vi.fn().mockResolvedValue({
    nodeResults: { node1: { nodeId: "node1", output: "Graph result", durationMs: 100 } },
    output: "Graph result",
    totalDurationMs: 100,
    totalTokenUsage: { input: 0, output: 0 },
  });

  class MockAgentGraph {
    run = runFn;
    static create() {
      return new MockGraphBuilder();
    }
  }

  class MockGraphBuilder {
    node() { return this; }
    edge() { return this; }
    build() { return new MockAgentGraph(); }
  }

  return { AgentGraph: MockAgentGraph, AgentGraphBuilder: MockGraphBuilder };
});

vi.mock("../../cli/providers.js", () => ({
  createModel: vi.fn().mockResolvedValue({ modelId: "test", provider: "test" }),
  isValidProvider: vi.fn().mockReturnValue(true),
  SUPPORTED_PROVIDERS: ["openai", "anthropic", "google", "groq", "mistral"],
}));

// =============================================================================
// Helpers
// =============================================================================

function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf-8"),
        }),
      );
    });

    req.on("error", reject);
    if (body !== undefined) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// =============================================================================
// Router unit tests
// =============================================================================

describe("Router", () => {
  it("resolves exact path match", () => {
    const router = new Router();
    const handler = vi.fn();
    router.get("/api/health", handler);

    const match = router.resolve("GET", "/api/health");
    expect(match).not.toBeNull();
    expect(match!.handler).toBe(handler);
    expect(match!.params).toEqual({});
  });

  it("resolves parameterized path", () => {
    const router = new Router();
    const handler = vi.fn();
    router.get("/api/agents/:id", handler);

    const match = router.resolve("GET", "/api/agents/abc-123");
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ id: "abc-123" });
  });

  it("returns null for unmatched path", () => {
    const router = new Router();
    router.get("/api/health", vi.fn());

    expect(router.resolve("GET", "/api/unknown")).toBeNull();
  });

  it("returns null for wrong method", () => {
    const router = new Router();
    router.get("/api/health", vi.fn());

    expect(router.resolve("POST", "/api/health")).toBeNull();
  });

  it("registers POST routes", () => {
    const router = new Router();
    const handler = vi.fn();
    router.post("/api/run", handler);

    const match = router.resolve("POST", "/api/run");
    expect(match).not.toBeNull();
    expect(match!.handler).toBe(handler);
  });

  it("registers OPTIONS routes", () => {
    const router = new Router();
    const handler = vi.fn();
    router.options("/api/run", handler);

    const match = router.resolve("OPTIONS", "/api/run");
    expect(match).not.toBeNull();
  });
});

// =============================================================================
// Server integration tests
// =============================================================================

describe("GaussServer", () => {
  let server: OneAgentServer;
  const PORT = 0; // Use ephemeral port
  let actualPort: number;

  beforeAll(async () => {
    server = new GaussServer({ port: 0, cors: true });
    // Listen on port 0 to get a random available port
    await server.listen(0);
    // Get the actual port from the underlying server
    const addr = (server as any).server?.address();
    actualPort = typeof addr === "object" && addr ? addr.port : 3456;
  });

  afterAll(async () => {
    await server.close();
  });

  // -------------------------------------------------------------------------
  // Health endpoint
  // -------------------------------------------------------------------------

  describe("GET /api/health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(actualPort, "GET", "/api/health");
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ status: "ok", version: "0.1.0" });
    });

    it("has JSON content type", async () => {
      const res = await request(actualPort, "GET", "/api/health");
      expect(res.headers["content-type"]).toBe("application/json");
    });
  });

  // -------------------------------------------------------------------------
  // Info endpoint
  // -------------------------------------------------------------------------

  describe("GET /api/info", () => {
    it("returns server info", async () => {
      const res = await request(actualPort, "GET", "/api/info");
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.version).toBe("0.1.0");
      expect(body.defaultProvider).toBe("openai");
      expect(body.defaultModel).toBe("gpt-4o");
      expect(body.endpoints).toBeInstanceOf(Array);
    });
  });

  // -------------------------------------------------------------------------
  // CORS
  // -------------------------------------------------------------------------

  describe("CORS headers", () => {
    it("adds CORS headers to responses", async () => {
      const res = await request(actualPort, "GET", "/api/health");
      expect(res.headers["access-control-allow-origin"]).toBe("*");
      expect(res.headers["access-control-allow-methods"]).toContain("GET");
      expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
    });

    it("handles OPTIONS preflight", async () => {
      const res = await request(actualPort, "OPTIONS", "/api/run");
      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });
  });

  // -------------------------------------------------------------------------
  // 404
  // -------------------------------------------------------------------------

  describe("Not found", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await request(actualPort, "GET", "/api/unknown");
      expect(res.status).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/run
  // -------------------------------------------------------------------------

  describe("POST /api/run", () => {
    it("returns agent result", async () => {
      const res = await request(actualPort, "POST", "/api/run", {
        prompt: "Hello",
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.text).toBe("Mock AI response");
      expect(body.sessionId).toBe("mock-session-id");
      expect(body.steps).toBe(1);
      expect(typeof body.duration).toBe("number");
    });

    it("returns 400 for invalid JSON", async () => {
      const res = await request(actualPort, "POST", "/api/run", "not json{{{");
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("Invalid JSON");
    });

    it("returns 400 for missing prompt", async () => {
      const res = await request(actualPort, "POST", "/api/run", { model: "gpt-4o" });
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("prompt");
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/stream
  // -------------------------------------------------------------------------

  describe("POST /api/stream", () => {
    it("returns SSE stream", async () => {
      const res = await request(actualPort, "POST", "/api/stream", {
        prompt: "Hello stream",
      });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");

      // Parse SSE events
      const events = res.body
        .split("\n\n")
        .filter((e) => e.startsWith("data:"))
        .map((e) => JSON.parse(e.replace(/^data: /, "")));

      expect(events.length).toBeGreaterThanOrEqual(2);

      // First events are tokens
      const tokenEvents = events.filter((e: { type: string }) => e.type === "token");
      expect(tokenEvents.length).toBe(2);
      expect(tokenEvents[0].content).toBe("Hello");
      expect(tokenEvents[1].content).toBe(" World");

      // Last event is done
      const doneEvent = events.find((e: { type: string }) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent.text).toBe("Hello World");
      expect(doneEvent.sessionId).toBe("mock-session-id");
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/graph/run
  // -------------------------------------------------------------------------

  describe("POST /api/graph/run", () => {
    it("returns graph results", async () => {
      const res = await request(actualPort, "POST", "/api/graph/run", {
        prompt: "Graph test",
        nodes: [{ id: "node1", instructions: "Be helpful" }],
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.results).toBeDefined();
      expect(typeof body.duration).toBe("number");
    });

    it("returns 400 for missing nodes", async () => {
      const res = await request(actualPort, "POST", "/api/graph/run", {
        prompt: "Test",
      });
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("nodes");
    });

    it("returns 400 for missing prompt", async () => {
      const res = await request(actualPort, "POST", "/api/graph/run", {
        nodes: [{ id: "n1", instructions: "x" }],
      });
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("prompt");
    });
  });
});

// =============================================================================
// Server with auth
// =============================================================================

describe("GaussServer (with auth)", () => {
  let server: OneAgentServer;
  let actualPort: number;
  const API_KEY = "test-secret-key-123";

  beforeAll(async () => {
    server = new GaussServer({ port: 0, apiKey: API_KEY });
    await server.listen(0);
    const addr = (server as any).server?.address();
    actualPort = typeof addr === "object" && addr ? addr.port : 3457;
  });

  afterAll(async () => {
    await server.close();
  });

  it("health endpoint is always public", async () => {
    const res = await request(actualPort, "GET", "/api/health");
    expect(res.status).toBe(200);
  });

  it("rejects requests without auth header", async () => {
    const res = await request(actualPort, "GET", "/api/info");
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("Unauthorized");
  });

  it("rejects requests with wrong token", async () => {
    const res = await request(actualPort, "GET", "/api/info", undefined, {
      Authorization: "Bearer wrong-key",
    });
    expect(res.status).toBe(401);
  });

  it("accepts requests with correct Bearer token", async () => {
    const res = await request(actualPort, "GET", "/api/info", undefined, {
      Authorization: `Bearer ${API_KEY}`,
    });
    expect(res.status).toBe(200);
  });

  it("accepts POST with correct Bearer token", async () => {
    const res = await request(
      actualPort,
      "POST",
      "/api/run",
      { prompt: "Hello" },
      { Authorization: `Bearer ${API_KEY}` },
    );
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// Agent Health Endpoint Tests
// =============================================================================

describe("GaussServer with Agent", () => {
  const API_KEY = "test-key-123";
  let actualPort: number;

  describe("Agent health endpoint", () => {
    let server: GaussServer;
    let mockAgent: any;

    beforeEach(async () => {
      // Create mock agent with lifecycle methods
      mockAgent = {
        startup: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          details: {
            lifecycle: { status: 'up', message: 'Agent is ready' }
          }
        }),
        isReady: vi.fn().mockReturnValue(true),
        isShuttingDown: vi.fn().mockReturnValue(false),
      };

      server = new GaussServer(
        {
          port: 0,
          apiKey: API_KEY,
          defaultProvider: "openai",
          defaultModel: "gpt-4o",
          cors: true,
        },
        mockAgent
      );

      await server.listen();
      const addr = (server as any).server?.address();
      actualPort = typeof addr === "object" && addr ? addr.port : 3458;
    });

    afterEach(async () => {
      try {
        await server.close();
      } catch (error) {
        // Ignore errors if server is already closed
        if (!(error instanceof Error) || !error.message.includes('Server is not running')) {
          throw error;
        }
      }
    });

    it("should expose /health endpoint when agent is provided", async () => {
      const res = await request(actualPort, "GET", "/health");
      expect(res.status).toBe(200);
      
      const body = JSON.parse(res.body);
      expect(body.healthy).toBe(true);
      expect(body.details.lifecycle.status).toBe('up');
      expect(mockAgent.healthCheck).toHaveBeenCalledTimes(1);
    });

    it("should return 503 for unhealthy agent", async () => {
      // Mock unhealthy agent
      mockAgent.healthCheck.mockResolvedValue({
        healthy: false,
        details: {
          lifecycle: { status: 'down', message: 'Agent not started' }
        }
      });

      const res = await request(actualPort, "GET", "/health");
      expect(res.status).toBe(503);
      
      const body = JSON.parse(res.body);
      expect(body.healthy).toBe(false);
      expect(body.details.lifecycle.status).toBe('down');
    });

    it("should call agent startup during server start", async () => {
      // startup should have been called during server.listen()
      expect(mockAgent.startup).toHaveBeenCalledTimes(1);
    });

    it("should call agent shutdown during server close", async () => {
      // Reset the mock to count calls from this test only
      mockAgent.shutdown.mockClear();
      
      // Manually close the server
      await server.close();
      
      // shutdown should be called during server.close()
      expect(mockAgent.shutdown).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// parseBody / sendJson / sendError unit tests
// =============================================================================

describe("HTTP helpers", () => {
  describe("sendJson", () => {
    it("writes JSON with correct headers", () => {
      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as any;

      sendJson(res, 200, { ok: true });
      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
      expect(res.end).toHaveBeenCalledWith('{"ok":true}');
    });
  });

  describe("sendError", () => {
    it("writes error JSON with correct status", () => {
      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as any;

      sendError(res, 400, "Bad request");
      expect(res.writeHead).toHaveBeenCalledWith(400, {
        "Content-Type": "application/json",
      });
      const parsed = JSON.parse(res.end.mock.calls[0][0]);
      expect(parsed.error.code).toBe(400);
      expect(parsed.error.message).toBe("Bad request");
    });
  });
});
