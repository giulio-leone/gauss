/**
 * E2E Tests — Team, Graph, Workflow, Network orchestration
 *
 * Uses a mock OpenAI-compatible HTTP server (same pattern as native-integration.test.ts).
 * Exercises multi-agent coordination primitives end-to-end through the Rust core.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  Agent,
  Team,
  Graph,
  Workflow,
  Network,
} from "../src/sdk/index.js";

// ---------------------------------------------------------------------------
// Mock OpenAI-compatible HTTP server
// ---------------------------------------------------------------------------
let mockServer: Server;
let mockPort: number;
let requestCount = 0;

/**
 * Creates a mock server that returns different responses based on the agent
 * instructions or message content found in the request body.
 */
function createMockOpenAIServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });

        if (req.url?.includes("/chat/completions")) {
          requestCount++;
          const parsed = JSON.parse(body);
          const messages: Array<{ role: string; content: string }> =
            parsed.messages ?? [];

          // Derive a response tag from the system prompt or last user message
          const systemMsg = messages.find((m) => m.role === "system");
          const userMsg = [...messages].reverse().find((m) => m.role === "user");
          let tag = "default";

          if (systemMsg?.content?.toLowerCase().includes("researcher")) {
            tag = "researcher";
          } else if (systemMsg?.content?.toLowerCase().includes("writer")) {
            tag = "writer";
          } else if (systemMsg?.content?.toLowerCase().includes("editor")) {
            tag = "editor";
          } else if (systemMsg?.content?.toLowerCase().includes("supervisor")) {
            tag = "supervisor";
          } else if (systemMsg?.content?.toLowerCase().includes("router")) {
            tag = "router";
          } else if (userMsg?.content?.toLowerCase().includes("research")) {
            tag = "researcher";
          } else if (userMsg?.content?.toLowerCase().includes("write")) {
            tag = "writer";
          }

          const responseText: Record<string, string> = {
            researcher:
              "Research findings: quantum computing uses qubits for parallel computation.",
            writer:
              "Article draft: Quantum computing revolutionizes data processing.",
            editor:
              "Edited: Quantum computing revolutionizes data processing efficiently.",
            supervisor: "Delegating task to the appropriate specialist agent.",
            router: "Routing to: researcher",
            default: `Mock response #${requestCount} from gauss-core.`,
          };

          res.end(
            JSON.stringify({
              id: `mock-${requestCount}`,
              object: "chat.completion",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: responseText[tag],
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
              },
            }),
          );
        } else {
          res.end(JSON.stringify({ error: "Unknown endpoint" }));
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function agentConfig() {
  return {
    provider: "openai" as const,
    model: "gpt-4",
    providerOptions: {
      apiKey: "sk-mock-test",
      baseUrl: `http://127.0.0.1:${mockPort}/v1`,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers — create pre-configured agents
// ---------------------------------------------------------------------------
function makeAgent(name: string, instructions: string): Agent {
  return new Agent({ ...agentConfig(), name, instructions });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe("E2E: Team / Graph / Workflow / Network Orchestration", () => {
  beforeAll(async () => {
    const result = await createMockOpenAIServer();
    mockServer = result.server;
    mockPort = result.port;
  });

  afterAll(() => {
    mockServer?.close();
  });

  // =========================================================================
  // Team
  // =========================================================================
  describe("Team", () => {
    it("creates a team with multiple agents", () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");

      const team = new Team("content-team");
      team.add(a1).add(a2);

      // If we reach here without throwing, creation succeeded
      expect(team.handle).toBeTruthy();

      team.destroy();
      a1.destroy();
      a2.destroy();
    });

    it("runs with sequential strategy", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");

      const team = new Team("seq-team");
      team.add(a1).add(a2).strategy("sequential");

      const result = await team.run("Tell me about quantum computing");

      expect(result).toBeTruthy();
      expect(result.finalText).toBeTruthy();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeGreaterThanOrEqual(2);

      for (const r of result.results) {
        expect(r.text).toBeTruthy();
        expect(typeof r.inputTokens).toBe("number");
        expect(typeof r.outputTokens).toBe("number");
      }

      team.destroy();
      a1.destroy();
      a2.destroy();
    });

    it("runs with parallel strategy", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");
      const a3 = makeAgent("editor", "You are an editor.");

      const team = new Team("parallel-team");
      team.add(a1).add(a2).add(a3).strategy("parallel");

      const result = await team.run("Summarize quantum computing");

      expect(result).toBeTruthy();
      expect(result.finalText).toBeTruthy();
      expect(result.results.length).toBeGreaterThanOrEqual(3);

      team.destroy();
      a1.destroy();
      a2.destroy();
      a3.destroy();
    });

    it("team result contains outputs from all agents", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");

      const team = new Team("verify-team");
      team.add(a1).add(a2).strategy("sequential");

      const result = await team.run("Explain AI");

      expect(result.results).toHaveLength(2);
      // Each agent should have produced a non-empty response
      for (const r of result.results) {
        expect(r.text.length).toBeGreaterThan(0);
        expect(r.steps).toBeGreaterThanOrEqual(0);
      }

      team.destroy();
      a1.destroy();
      a2.destroy();
    });

    it("prevents use after destroy", () => {
      const a1 = makeAgent("tmp-agent", "You are temporary.");
      const team = new Team("tmp-team");
      team.add(a1);
      team.destroy();

      expect(() => team.strategy("sequential")).toThrow("destroyed");

      a1.destroy();
    });
  });

  // =========================================================================
  // Graph
  // =========================================================================
  describe("Graph", () => {
    it("creates a graph with nodes and edges", () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");

      const graph = new Graph();
      graph
        .addNode({ nodeId: "research", agent: a1 })
        .addNode({ nodeId: "write", agent: a2 })
        .addEdge("research", "write");

      expect(graph.handle).toBeTruthy();

      graph.destroy();
      a1.destroy();
      a2.destroy();
    });

    it("executes a simple linear graph (A → B)", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");

      const graph = new Graph();
      graph
        .addNode({ nodeId: "research", agent: a1 })
        .addNode({ nodeId: "write", agent: a2 })
        .addEdge("research", "write");

      const result = await graph.run("Explain quantum computing");

      expect(result).toBeTruthy();
      // The result should contain output keyed by node id
      expect(typeof result).toBe("object");

      graph.destroy();
      a1.destroy();
      a2.destroy();
    });

    it("executes a graph with fork/join", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");
      const a3 = makeAgent("editor", "You are an editor.");

      const graph = new Graph();
      graph
        .addFork({
          nodeId: "parallel-research",
          agents: [
            { agent: a1, instructions: "Research the topic" },
            { agent: a2, instructions: "Write a draft" },
          ],
          consensus: "concat",
        })
        .addNode({ nodeId: "edit", agent: a3 })
        .addEdge("parallel-research", "edit");

      const result = await graph.run("Discuss machine learning");

      expect(result).toBeTruthy();
      expect(typeof result).toBe("object");

      graph.destroy();
      a1.destroy();
      a2.destroy();
      a3.destroy();
    });

    it("executes a three-node linear graph (A → B → C)", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");
      const a3 = makeAgent("editor", "You are an editor.");

      const graph = new Graph();
      graph
        .addNode({ nodeId: "research", agent: a1 })
        .addNode({ nodeId: "write", agent: a2 })
        .addNode({ nodeId: "edit", agent: a3 })
        .addEdge("research", "write")
        .addEdge("write", "edit");

      const result = await graph.run("Describe neural networks");

      expect(result).toBeTruthy();

      graph.destroy();
      a1.destroy();
      a2.destroy();
      a3.destroy();
    });

    it("prevents use after destroy", () => {
      const graph = new Graph();
      graph.destroy();

      const a = makeAgent("tmp", "temp");
      expect(() => graph.addNode({ nodeId: "n1", agent: a })).toThrow(
        "destroyed",
      );
      a.destroy();
    });
  });

  // =========================================================================
  // Workflow
  // =========================================================================
  describe("Workflow", () => {
    it("creates a workflow with sequential steps", () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");

      const wf = new Workflow();
      wf.addStep({ stepId: "research", agent: a1 })
        .addStep({ stepId: "write", agent: a2 })
        .addDependency("write", "research");

      expect(wf.handle).toBeTruthy();

      wf.destroy();
      a1.destroy();
      a2.destroy();
    });

    it("executes a two-step workflow in order", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");

      const wf = new Workflow();
      wf.addStep({ stepId: "research", agent: a1 })
        .addStep({ stepId: "write", agent: a2 })
        .addDependency("write", "research");

      const result = await wf.run("Explain quantum computing");

      expect(result).toBeTruthy();
      expect(typeof result).toBe("object");

      wf.destroy();
      a1.destroy();
      a2.destroy();
    });

    it("executes a multi-step workflow (A → B → C)", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");
      const a3 = makeAgent("editor", "You are an editor.");

      const wf = new Workflow();
      wf.addStep({ stepId: "research", agent: a1 })
        .addStep({ stepId: "write", agent: a2 })
        .addStep({ stepId: "edit", agent: a3 })
        .addDependency("write", "research")
        .addDependency("edit", "write");

      const result = await wf.run("Write about deep learning");

      expect(result).toBeTruthy();
      expect(typeof result).toBe("object");

      wf.destroy();
      a1.destroy();
      a2.destroy();
      a3.destroy();
    });

    it("executes a workflow with parallel independent steps", async () => {
      const a1 = makeAgent("researcher", "You are a researcher.");
      const a2 = makeAgent("writer", "You are a writer.");
      const a3 = makeAgent("editor", "You are an editor.");

      // research and write are independent; edit depends on both
      const wf = new Workflow();
      wf.addStep({ stepId: "research", agent: a1 })
        .addStep({ stepId: "write", agent: a2 })
        .addStep({ stepId: "edit", agent: a3 })
        .addDependency("edit", "research")
        .addDependency("edit", "write");

      const result = await wf.run("Compare ML frameworks");

      expect(result).toBeTruthy();

      wf.destroy();
      a1.destroy();
      a2.destroy();
      a3.destroy();
    });

    it("prevents use after destroy", () => {
      const wf = new Workflow();
      wf.destroy();

      const a = makeAgent("tmp", "temp");
      expect(() => wf.addStep({ stepId: "s1", agent: a })).toThrow(
        "destroyed",
      );
      a.destroy();
    });
  });

  // =========================================================================
  // Network
  // =========================================================================
  describe("Network", () => {
    it("creates a network with agents and supervisor", () => {
      const supervisor = makeAgent("supervisor", "You are a supervisor.");
      const researcher = makeAgent("researcher", "You are a researcher.");
      const writer = makeAgent("writer", "You are a writer.");

      const net = new Network();
      net
        .addAgent(supervisor, "Supervise and delegate tasks")
        .addAgent(researcher, "Research topics in depth")
        .addAgent(writer, "Write polished articles")
        .setSupervisor("supervisor");

      expect(net.handle).toBeTruthy();

      net.destroy();
      supervisor.destroy();
      researcher.destroy();
      writer.destroy();
    });

    it("retrieves agent cards", () => {
      const supervisor = makeAgent("supervisor", "You are a supervisor.");
      const researcher = makeAgent("researcher", "You are a researcher.");

      const net = new Network();
      net
        .addAgent(supervisor, "Supervise tasks")
        .addAgent(researcher, "Research topics");

      const cards = net.agentCards();
      expect(cards).toBeTruthy();

      net.destroy();
      supervisor.destroy();
      researcher.destroy();
    });

    it("delegates a task between agents", async () => {
      const supervisor = makeAgent("supervisor", "You are a supervisor.");
      const researcher = makeAgent("researcher", "You are a researcher.");
      const writer = makeAgent("writer", "You are a writer.");

      const net = new Network();
      net
        .addAgent(supervisor, "Supervise and delegate tasks")
        .addAgent(researcher, "Research topics in depth")
        .addAgent(writer, "Write polished articles")
        .setSupervisor("supervisor");

      const result = await net.delegate(
        "supervisor",
        "researcher",
        "Research quantum computing",
      );

      expect(result).toBeTruthy();

      net.destroy();
      supervisor.destroy();
      researcher.destroy();
      writer.destroy();
    });

    it("delegates across multiple agents", async () => {
      const supervisor = makeAgent("supervisor", "You are a supervisor.");
      const researcher = makeAgent("researcher", "You are a researcher.");
      const writer = makeAgent("writer", "You are a writer.");

      const net = new Network();
      net
        .addAgent(supervisor, "Supervise and delegate tasks")
        .addAgent(researcher, "Research topics in depth")
        .addAgent(writer, "Write polished articles")
        .setSupervisor("supervisor");

      const r1 = await net.delegate(
        "supervisor",
        "researcher",
        "Research AI safety",
      );
      const r2 = await net.delegate(
        "supervisor",
        "writer",
        "Write about AI safety",
      );

      expect(r1).toBeTruthy();
      expect(r2).toBeTruthy();

      net.destroy();
      supervisor.destroy();
      researcher.destroy();
      writer.destroy();
    });

    it("prevents use after destroy", () => {
      const net = new Network();
      net.destroy();

      const a = makeAgent("tmp", "temp");
      expect(() => net.addAgent(a)).toThrow("destroyed");
      a.destroy();
    });
  });
});
