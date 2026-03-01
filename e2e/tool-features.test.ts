/**
 * E2E Tests — ToolRegistry, ToolValidator, and Agent tool-use features.
 *
 * Exercises real native Rust bindings for ToolRegistry and ToolValidator,
 * and uses a local mock HTTP server for Agent tool-call / tool-result loops.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

import {
  ToolRegistry,
  ToolValidator,
  Agent,
} from "../src/sdk/index.js";

// ---------------------------------------------------------------------------
// Mock OpenAI-compatible HTTP server (tool-call aware)
// ---------------------------------------------------------------------------
let mockServer: Server;
let mockPort: number;

/**
 * Tracks request count per test so the mock can return tool_calls on the
 * first request and a normal completion on the second.
 */
let requestCount = 0;

function resetRequestCount(): void {
  requestCount = 0;
}

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

          // Check if this request contains a tool_result (second call in the loop)
          const hasToolResult = parsed.messages?.some(
            (m: any) => m.role === "tool"
          );

          if (!hasToolResult && requestCount === 1) {
            // First request: respond with a tool_call
            res.end(
              JSON.stringify({
                id: "mock-tool-1",
                object: "chat.completion",
                choices: [{
                  index: 0,
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [{
                      id: "call_abc123",
                      type: "function",
                      function: {
                        name: "get_weather",
                        arguments: JSON.stringify({ location: "Rome" }),
                      },
                    }],
                  },
                  finish_reason: "tool_calls",
                }],
                usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 },
              })
            );
          } else {
            // Second request (with tool result) or fallback: normal completion
            res.end(
              JSON.stringify({
                id: "mock-tool-2",
                object: "chat.completion",
                choices: [{
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "The weather in Rome is sunny, 25°C.",
                  },
                  finish_reason: "stop",
                }],
                usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
              })
            );
          }
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
// Test Suite
// ---------------------------------------------------------------------------

describe("E2E: Tool Features (ToolRegistry, ToolValidator, Agent tool-use)", () => {
  beforeAll(async () => {
    const result = await createMockOpenAIServer();
    mockServer = result.server;
    mockPort = result.port;
  });

  afterAll(() => {
    mockServer?.close();
  });

  // =========================================================================
  // ToolRegistry (Rust handle lifecycle via native bindings)
  // =========================================================================
  describe("ToolRegistry (Rust lifecycle)", () => {
    it("creates a registry, adds tools, and lists them", () => {
      const registry = new ToolRegistry();

      registry.add({
        name: "search",
        description: "Search the web for information",
        tags: ["web", "search"],
        examples: [
          { description: "Search for weather", input: { query: "weather in Rome" } },
        ],
      });

      registry.add({
        name: "calculator",
        description: "Perform arithmetic calculations",
        tags: ["math", "utility"],
        examples: [
          { description: "Add two numbers", input: { expression: "2 + 2" }, expectedOutput: 4 },
        ],
      });

      registry.add({
        name: "web_scraper",
        description: "Scrape content from a web page",
        tags: ["web", "scraper"],
      });

      const all = registry.list();
      expect(all).toBeTruthy();
      expect(all.length).toBe(3);

      registry.destroy();
    });

    it("searches tools by query", () => {
      const registry = new ToolRegistry();

      registry.add({ name: "search", description: "Search the web", tags: ["web"] });
      registry.add({ name: "calculator", description: "Math calculations", tags: ["math"] });
      registry.add({ name: "translator", description: "Translate text between languages", tags: ["language"] });

      const results = registry.search("web");
      expect(results).toBeTruthy();
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name === "search")).toBe(true);

      registry.destroy();
    });

    it("filters tools by tag", () => {
      const registry = new ToolRegistry();

      registry.add({ name: "search", description: "Search the web", tags: ["web", "search"] });
      registry.add({ name: "scraper", description: "Scrape web pages", tags: ["web", "scraper"] });
      registry.add({ name: "calculator", description: "Math", tags: ["math"] });

      const webTools = registry.byTag("web");
      expect(webTools).toBeTruthy();
      expect(webTools.length).toBe(2);
      expect(webTools.every((t) => t.tags.includes("web"))).toBe(true);

      const mathTools = registry.byTag("math");
      expect(mathTools.length).toBe(1);
      expect(mathTools[0].name).toBe("calculator");

      registry.destroy();
    });

    it("returns empty results for non-matching query", () => {
      const registry = new ToolRegistry();
      registry.add({ name: "search", description: "Search", tags: ["web"] });

      const results = registry.search("zzz_nonexistent_xyz");
      expect(results).toBeTruthy();
      expect(results.length).toBe(0);

      registry.destroy();
    });

    it("returns empty results for non-matching tag", () => {
      const registry = new ToolRegistry();
      registry.add({ name: "search", description: "Search", tags: ["web"] });

      const results = registry.byTag("nonexistent_tag");
      expect(results).toBeTruthy();
      expect(results.length).toBe(0);

      registry.destroy();
    });

    it("prevents use after destroy", () => {
      const registry = new ToolRegistry();
      registry.destroy();
      expect(() =>
        registry.add({ name: "test", description: "test" })
      ).toThrow("destroyed");
    });
  });

  // =========================================================================
  // ToolValidator (Rust handle lifecycle)
  // =========================================================================
  describe("ToolValidator (Rust lifecycle)", () => {
    it("validates a correct tool call against its schema", () => {
      const validator = new ToolValidator();

      const schema = {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      };

      const result = validator.validate({ query: "test", limit: 10 }, schema);
      expect(result).toBeTruthy();

      validator.destroy();
    });

    it("validates required parameters are present", () => {
      const validator = new ToolValidator();

      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "age"],
      };

      // Both required fields present
      const valid = validator.validate({ name: "Alice", age: 30 }, schema);
      expect(valid).toBeTruthy();

      validator.destroy();
    });

    it("validates parameter types", () => {
      const validator = new ToolValidator();

      const schema = {
        type: "object",
        properties: {
          count: { type: "number" },
          enabled: { type: "boolean" },
          label: { type: "string" },
        },
      };

      const result = validator.validate(
        { count: 42, enabled: true, label: "test" },
        schema
      );
      expect(result).toBeTruthy();

      validator.destroy();
    });

    it("validates nested object schemas", () => {
      const validator = new ToolValidator();

      const schema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
          },
        },
      };

      const result = validator.validate(
        { user: { name: "Bob", email: "bob@example.com" } },
        schema
      );
      expect(result).toBeTruthy();

      validator.destroy();
    });

    it("prevents use after destroy", () => {
      const validator = new ToolValidator();
      validator.destroy();
      expect(() =>
        validator.validate({ query: "test" }, { type: "object" })
      ).toThrow("destroyed");
    });
  });

  // =========================================================================
  // Agent with tools — mock server returning tool_calls
  // =========================================================================
  describe("Agent with tools (tool-call loop via mock server)", () => {
    it("creates an agent with tool definitions", () => {
      const agent = new Agent({
        ...agentConfig(),
        instructions: "You are a weather assistant.",
        tools: [
          {
            name: "get_weather",
            description: "Get current weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
              },
              required: ["location"],
            },
          },
        ],
      });

      expect(agent.name).toBe("agent");
      expect(agent.provider).toBe("openai");
      expect(agent.model).toBe("gpt-4");
      agent.destroy();
    });

    it("receives a tool_call from the mock server and completes the loop", async () => {
      resetRequestCount();

      const agent = new Agent({
        ...agentConfig(),
        instructions: "You are a weather assistant.",
        tools: [
          {
            name: "get_weather",
            description: "Get current weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
              },
              required: ["location"],
            },
          },
        ],
      });

      // Tool executor: receives the tool call, returns a result
      const toolExecutor = async (callJson: string): Promise<string> => {
        const call = JSON.parse(callJson);
        expect(call.name).toBe("get_weather");
        const args = typeof call.arguments === "string"
          ? JSON.parse(call.arguments)
          : call.arguments;
        expect(args.location).toBe("Rome");
        return JSON.stringify({ temperature: 25, condition: "sunny" });
      };

      const result = await agent.runWithTools(
        "What's the weather in Rome?",
        toolExecutor
      );

      expect(result).toBeTruthy();
      expect(result.text).toContain("Rome");
      expect(result.text).toContain("sunny");

      agent.destroy();
    });

    it("agent addTool fluent API works with tool executor", async () => {
      resetRequestCount();

      const agent = new Agent({
        ...agentConfig(),
        instructions: "You are a helpful assistant.",
      });

      agent.addTool({
        name: "get_weather",
        description: "Get current weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        },
      });

      const toolCalls: string[] = [];
      const toolExecutor = async (callJson: string): Promise<string> => {
        toolCalls.push(callJson);
        return JSON.stringify({ temperature: 25, condition: "sunny" });
      };

      const result = await agent.runWithTools("Weather in Rome?", toolExecutor);
      expect(result).toBeTruthy();
      expect(result.text).toBeTruthy();

      agent.destroy();
    });
  });
});
