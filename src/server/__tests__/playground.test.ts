// =============================================================================
// Playground API Tests
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NodeHttpServer } from "../../server/node-http.server.js";
import { registerPlaygroundRoutes, type PlaygroundAgent } from "../../server/playground-api.js";

const TEST_PORT = 48901;

describe("PlaygroundAPI", () => {
  let server: NodeHttpServer;
  const agents: PlaygroundAgent[] = [
    {
      name: "echo-agent",
      description: "Echoes back the prompt",
      invoke: async (prompt) => `Echo: ${prompt}`,
    },
    {
      name: "stream-agent",
      description: "Streams response word by word",
      invoke: async (prompt, options) => {
        if (options?.stream) {
          return (async function* () {
            for (const word of prompt.split(" ")) {
              yield word;
            }
          })();
        }
        return `Full: ${prompt}`;
      },
    },
  ];

  beforeAll(async () => {
    server = new NodeHttpServer();
    registerPlaygroundRoutes({ server, agents });
    await server.listen(TEST_PORT);
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/agents lists all agents", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/agents`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("echo-agent");
    expect(data[1].name).toBe("stream-agent");
  });

  it("POST /api/agents/:name/run executes agent", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/agents/echo-agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello world" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response).toBe("Echo: hello world");
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
    expect(data.id).toMatch(/^run-/);
  });

  it("POST /api/agents/:name/run returns 404 for unknown agent", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/agents/unknown/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/agents/:name/run returns 400 without prompt", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/agents/echo-agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/agents/:name/history returns run history", async () => {
    // Previous run should be in history
    const res = await fetch(`http://localhost:${TEST_PORT}/api/agents/echo-agent/history`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].agentName).toBe("echo-agent");
    expect(data[0].prompt).toBe("hello world");
  });

  it("GET /api/agents/:name/stream returns SSE events", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/agents/echo-agent/stream?prompt=hi%20there`);
    expect(res.status).toBe(200);
    const text = await res.text();
    // The stream writes "data: <chunk>\n\n" for each yielded value
    expect(text).toContain("Echo: hi there");
  });

  it("GET /api/agents/:name/stream returns 400 without prompt", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/agents/echo-agent/stream`);
    expect(res.status).toBe(400);
  });

  it("GET /api/health returns ok", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.agents).toBe(2);
  });
});
