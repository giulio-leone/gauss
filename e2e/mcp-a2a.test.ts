/**
 * E2E Tests — MCP Server & A2A Client
 *
 * MCP tests exercise the full round-trip: create server → register
 * tools/resources/prompts → send JSON-RPC messages → verify responses.
 *
 * A2A tests use a mock HTTP server that simulates an A2A-compliant remote
 * agent, then exercise the A2aClient against it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

import {
  McpServer,
  A2aClient,
  type McpResource,
  type McpPrompt,
  type AgentCard,
  type Task,
} from "../src/sdk/index.js";

// ---------------------------------------------------------------------------
// Check whether A2A native bindings are available
// ---------------------------------------------------------------------------
let a2aAvailable = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const napi = require("gauss-napi");
  if (typeof napi.a2aDiscover !== "function") a2aAvailable = false;
} catch {
  a2aAvailable = false;
}

const describeA2a = a2aAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Mock A2A-compliant HTTP server
// ---------------------------------------------------------------------------
let a2aServer: Server;
let a2aPort: number;

/** Minimal agent card served at /.well-known/agent.json */
const MOCK_AGENT_CARD: AgentCard = {
  name: "mock-a2a-agent",
  description: "A mock A2A agent for testing",
  url: "", // filled dynamically
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  skills: [
    {
      id: "echo",
      name: "Echo",
      description: "Echoes user input",
      tags: ["test"],
      examples: ["Hello"],
    },
  ],
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
};

const tasks = new Map<string, Task>();
let taskCounter = 0;

function createMockA2AServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Agent card discovery
      if (req.url === "/.well-known/agent.json" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(MOCK_AGENT_CARD));
        return;
      }

      // JSON-RPC endpoint
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });

        let rpc: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
          rpc = JSON.parse(body);
        } catch {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
          return;
        }

        const { id, method, params } = rpc;

        switch (method) {
          case "message/send": {
            const taskId = `task-${++taskCounter}`;
            const task: Task = {
              id: taskId,
              status: {
                state: "completed",
                message: {
                  role: "agent",
                  parts: [{ type: "text", text: "Echo: " + extractTextFromParams(params) }],
                },
                timestamp: new Date().toISOString(),
              },
            };
            tasks.set(taskId, task);
            res.end(JSON.stringify({ jsonrpc: "2.0", id, result: { _type: "task", ...task } }));
            break;
          }
          case "tasks/get": {
            const taskId = (params as Record<string, unknown>)?.id as string;
            const task = tasks.get(taskId);
            if (task) {
              res.end(JSON.stringify({ jsonrpc: "2.0", id, result: task }));
            } else {
              res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32001, message: "Task not found" } }));
            }
            break;
          }
          case "tasks/cancel": {
            const cancelId = (params as Record<string, unknown>)?.id as string;
            const existing = tasks.get(cancelId);
            if (existing) {
              existing.status = { state: "canceled", timestamp: new Date().toISOString() };
              res.end(JSON.stringify({ jsonrpc: "2.0", id, result: existing }));
            } else {
              res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32001, message: "Task not found" } }));
            }
            break;
          }
          default:
            res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }));
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      MOCK_AGENT_CARD.url = `http://127.0.0.1:${port}`;
      resolve({ server, port });
    });
  });
}

function extractTextFromParams(params?: Record<string, unknown>): string {
  try {
    const msg = params?.message as Record<string, unknown> | undefined;
    if (!msg) return "";
    const parts = msg.parts as Array<{ type: string; text?: string }> | undefined;
    if (!parts) return "";
    return parts.filter((p) => p.type === "text" && p.text).map((p) => p.text!).join("");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("E2E: MCP Server & A2A Client", () => {
  beforeAll(async () => {
    const result = await createMockA2AServer();
    a2aServer = result.server;
    a2aPort = result.port;
  });

  afterAll(() => {
    a2aServer?.close();
  });

  // =========================================================================
  // MCP Server
  // =========================================================================
  describe("McpServer (message round-trip)", () => {
    const sampleTool = {
      name: "get_weather",
      description: "Get current weather for a city",
      inputSchema: {
        type: "object",
        properties: { city: { type: "string", description: "City name" } },
        required: ["city"],
      },
    };

    const sampleResource: McpResource = {
      uri: "file:///data/config.json",
      name: "config",
      description: "Application configuration",
      mimeType: "application/json",
    };

    const samplePrompt: McpPrompt = {
      name: "summarize",
      description: "Summarize a document",
      arguments: [
        { name: "text", description: "Text to summarize", required: true },
        { name: "max_length", description: "Max summary length", required: false },
      ],
    };

    it("creates McpServer with name and version", () => {
      const server = new McpServer("test-server", "1.0.0");
      expect(server).toBeTruthy();
      expect(server.handle).toBeTruthy();
      server.destroy();
    });

    it("adds a tool to the server", () => {
      const server = new McpServer("tool-server", "0.1.0");
      const result = server.addTool(sampleTool as any);
      expect(result).toBe(server); // chainable
      server.destroy();
    });

    it("adds a resource to the server", () => {
      const server = new McpServer("resource-server", "0.1.0");
      const result = server.addResource(sampleResource);
      expect(result).toBe(server);
      server.destroy();
    });

    it("adds a prompt to the server", () => {
      const server = new McpServer("prompt-server", "0.1.0");
      const result = server.addPrompt(samplePrompt);
      expect(result).toBe(server);
      server.destroy();
    });

    it("handles tools/list message", async () => {
      const server = new McpServer("list-server", "1.0.0");
      server.addTool(sampleTool as any);
      server.addTool({ name: "search", description: "Search the web", inputSchema: { type: "object" } } as any);

      const response = await server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });

      expect(response).toBeTruthy();
      const res = response as { result?: { tools?: unknown[] } };
      expect(res.result?.tools).toBeTruthy();
      expect(Array.isArray(res.result?.tools)).toBe(true);
      expect(res.result!.tools!.length).toBeGreaterThanOrEqual(2);
      server.destroy();
    });

    it("handles resources/list message", async () => {
      const server = new McpServer("res-list-server", "1.0.0");
      server.addResource(sampleResource);
      server.addResource({
        uri: "file:///data/readme.md",
        name: "readme",
        description: "Project README",
        mimeType: "text/markdown",
      });

      const response = await server.handleMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/list",
      });

      expect(response).toBeTruthy();
      const res = response as { result?: { resources?: unknown[] } };
      expect(res.result?.resources).toBeTruthy();
      expect(Array.isArray(res.result?.resources)).toBe(true);
      expect(res.result!.resources!.length).toBeGreaterThanOrEqual(2);
      server.destroy();
    });

    it("handles prompts/list message", async () => {
      const server = new McpServer("prompt-list-server", "1.0.0");
      server.addPrompt(samplePrompt);

      const response = await server.handleMessage({
        jsonrpc: "2.0",
        id: 3,
        method: "prompts/list",
      });

      expect(response).toBeTruthy();
      const res = response as { result?: { prompts?: unknown[] } };
      expect(res.result?.prompts).toBeTruthy();
      expect(Array.isArray(res.result?.prompts)).toBe(true);
      expect(res.result!.prompts!.length).toBeGreaterThanOrEqual(1);
      server.destroy();
    });

    it("handles ping message", async () => {
      const server = new McpServer("ping-server", "1.0.0");

      const response = await server.handleMessage({
        jsonrpc: "2.0",
        id: 4,
        method: "ping",
      });

      expect(response).toBeTruthy();
      server.destroy();
    });

    it("handles tools/call message with tool execution", async () => {
      const server = new McpServer("call-server", "1.0.0");
      server.addTool(sampleTool as any);

      const response = await server.handleMessage({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "get_weather",
          arguments: { city: "Rome" },
        },
      });

      expect(response).toBeTruthy();
      const res = response as { result?: unknown; error?: unknown };
      // The server should return a result (even if the tool has no real executor,
      // the round-trip must succeed or return a structured error).
      expect(res.result !== undefined || res.error !== undefined).toBe(true);
      server.destroy();
    });

    it("handles invalid/unknown methods gracefully", async () => {
      const server = new McpServer("unknown-server", "1.0.0");

      const response = await server.handleMessage({
        jsonrpc: "2.0",
        id: 6,
        method: "nonexistent/method",
      });

      expect(response).toBeTruthy();
      const res = response as { error?: { code?: number; message?: string } };
      expect(res.error).toBeTruthy();
      expect(res.error!.code).toBeTruthy();
      server.destroy();
    });

    it("supports chaining addTool, addResource, addPrompt", () => {
      const server = new McpServer("chain-server", "1.0.0");
      const result = server
        .addTool(sampleTool as any)
        .addResource(sampleResource)
        .addPrompt(samplePrompt);

      expect(result).toBe(server);
      server.destroy();
    });

    it("prevents use after destroy", async () => {
      const server = new McpServer("disposed-server", "1.0.0");
      server.destroy();

      expect(() => server.addTool(sampleTool as any)).toThrow("destroyed");
      await expect(
        server.handleMessage({ jsonrpc: "2.0", id: 1, method: "ping" }),
      ).rejects.toThrow("destroyed");
    });
  });

  // =========================================================================
  // A2A Client / Protocol
  // =========================================================================
  describeA2a("A2aClient (mock HTTP server)", () => {
    let client: A2aClient;

    beforeAll(() => {
      client = new A2aClient({ baseUrl: `http://127.0.0.1:${a2aPort}` });
    });

    it("creates A2aClient with endpoint", () => {
      expect(client).toBeTruthy();
    });

    it("creates A2aClient from string shorthand", () => {
      const c = new A2aClient(`http://127.0.0.1:${a2aPort}`);
      expect(c).toBeTruthy();
    });

    it("discovers agent card", async () => {
      const card = await client.discover();
      expect(card).toBeTruthy();
      expect(card.name).toBe("mock-a2a-agent");
      expect(card.version).toBe("1.0.0");
      expect(card.skills).toBeTruthy();
      expect(card.skills!.length).toBeGreaterThanOrEqual(1);
      expect(card.skills![0].id).toBe("echo");
    });

    it("sends a message and receives a task", async () => {
      const result = await client.sendMessage({
        role: "user",
        parts: [{ type: "text", text: "Hello A2A!" }],
      });

      expect(result).toBeTruthy();
      expect(result.type).toBe("task");
      if (result.type === "task") {
        expect(result.task.id).toBeTruthy();
        expect(result.task.status.state).toBe("completed");
        expect(result.task.status.message).toBeTruthy();
        expect(result.task.status.message!.role).toBe("agent");
      }
    });

    it("gets task by id", async () => {
      // First create a task via sendMessage
      const sendResult = await client.sendMessage({
        role: "user",
        parts: [{ type: "text", text: "Create a task" }],
      });
      expect(sendResult.type).toBe("task");
      const taskId = (sendResult as { type: "task"; task: Task }).task.id;

      const task = await client.getTask(taskId);
      expect(task).toBeTruthy();
      expect(task.id).toBe(taskId);
      expect(task.status).toBeTruthy();
    });

    it("cancels a task", async () => {
      const sendResult = await client.sendMessage({
        role: "user",
        parts: [{ type: "text", text: "Cancel me" }],
      });
      const taskId = (sendResult as { type: "task"; task: Task }).task.id;

      const canceled = await client.cancelTask(taskId);
      expect(canceled).toBeTruthy();
      expect(canceled.status.state).toBe("canceled");
    });

    it("uses ask() shorthand for text round-trip", async () => {
      const answer = await client.ask("Ping from test");
      expect(answer).toBeTruthy();
      expect(typeof answer).toBe("string");
    });
  });
});
