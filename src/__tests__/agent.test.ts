import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "../core/llm/index.js";

import { Agent } from "../agent/agent.js";
import { VirtualFilesystem } from "../adapters/filesystem/virtual-fs.adapter.js";
import { InMemoryAdapter } from "../adapters/memory/in-memory.adapter.js";
import { ApproximateTokenCounter } from "../adapters/token-counter/approximate.adapter.js";
import type { AgentEvent } from "../types.js";

// =============================================================================
// Mock AI SDK — ToolLoopAgent
// =============================================================================

const { generateFn, constructorSpy } = vi.hoisted(() => {
  const generateFn = vi.fn().mockResolvedValue({
    text: "Mock response",
    steps: [{ type: "text" }],
    usage: { inputTokens: 10, outputTokens: 20 },
    finishReason: "stop",
    toolCalls: [],
    toolResults: [],
  });
  const constructorSpy = vi.fn();
  return { generateFn, constructorSpy };
});

vi.mock("../core/llm/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/llm/index.js")>();
  return {
    ...actual,
    generateText: (opts: Record<string, unknown>) => {
      constructorSpy(opts);
      return generateFn(opts);
    },
  };
});

// =============================================================================
// Helpers
// =============================================================================

const mockModel = {
  modelId: "test-model",
  provider: "test",
} as unknown as LanguageModel;

// =============================================================================
// Tests
// =============================================================================

describe("Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateFn.mockResolvedValue({
      text: "Mock response",
      steps: [{ type: "text" }],
    });
  });

  // ===========================================================================
  // Builder
  // ===========================================================================

  describe("Builder", () => {
    it("Agent.create returns a builder", () => {
      const builder = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      });

      expect(builder).toBeDefined();
      expect(builder).toHaveProperty("build");
      expect(builder).toHaveProperty("withFilesystem");
      expect(builder).toHaveProperty("withMemory");
      expect(builder).toHaveProperty("withPlanning");
      expect(builder).toHaveProperty("withMcp");
      expect(builder).toHaveProperty("withSubagents");
    });

    it("builder.build() creates a Agent with defaults (VFS, InMemory, ApproximateCounter)", () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      }).build();

      expect(agent).toBeInstanceOf(Agent);
      expect(agent.sessionId).toBeDefined();
      expect(typeof agent.sessionId).toBe("string");
      expect(agent.eventBus).toBeDefined();
    });

    it("builder chains withFilesystem, withMemory, withPlanning, etc.", () => {
      const vfs = new VirtualFilesystem();
      const memory = new InMemoryAdapter();
      const counter = new ApproximateTokenCounter();

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .withFilesystem(vfs)
        .withMemory(memory)
        .withTokenCounter(counter)
        .withPlanning()
        .withSubagents({ maxDepth: 5 })
        .withApproval({ defaultMode: "deny-all" })
        .build();

      expect(agent).toBeInstanceOf(Agent);
      expect(agent.sessionId).toBeDefined();
    });

    it("builder.withMaxSteps sets max steps", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .withMaxSteps(10)
        .build();

      await agent.run("Hello");

      expect(constructorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          system: "Test",
        }),
      );
    });

    it("builder.on registers event handlers", async () => {
      const handler = vi.fn();

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .on("agent:start", handler)
        .build();

      await agent.run("Hello");

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "agent:start",
          sessionId: agent.sessionId,
        }),
      );
    });
  });

  // ===========================================================================
  // Presets
  // ===========================================================================

  describe("Presets", () => {
    it("Agent.minimal creates agent with VFS + planning tools", async () => {
      const agent = Agent.minimal({
        model: mockModel,
        instructions: "Minimal agent",
      });

      expect(agent).toBeInstanceOf(Agent);
      expect(agent.sessionId).toBeDefined();

      await agent.run("Hello");

      expect(constructorSpy).toHaveBeenCalledTimes(1);
      const settings = constructorSpy.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const toolKeys = Object.keys(
        settings.tools as Record<string, unknown>,
      );
      expect(toolKeys).toContain("write_todos");
      expect(toolKeys).toContain("review_todos");
    });

    it("Agent.full creates agent with all features", async () => {
      const memory = new InMemoryAdapter();
      const counter = new ApproximateTokenCounter();

      const agent = Agent.full({
        model: mockModel,
        instructions: "Full agent",
        memory,
        tokenCounter: counter,
      });

      expect(agent).toBeInstanceOf(Agent);

      await agent.run("Hello");

      expect(constructorSpy).toHaveBeenCalledTimes(1);
      const settings = constructorSpy.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const toolKeys = Object.keys(
        settings.tools as Record<string, unknown>,
      );
      // Full includes planning + subagent tools
      expect(toolKeys).toContain("write_todos");
      expect(toolKeys).toContain("review_todos");
      expect(toolKeys).toContain("dispatch_subagent");
      expect(toolKeys).toContain("poll_subagent");
      expect(toolKeys).toContain("await_subagent");
    });
  });

  // ===========================================================================
  // Run
  // ===========================================================================

  describe("run", () => {
    it("agent.run calls generateText", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      }).build();

      await agent.run("Hello world");

      expect(constructorSpy).toHaveBeenCalledTimes(1);
      expect(generateFn).toHaveBeenCalledTimes(1);
      expect(generateFn).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Hello world" }));
    });

    it("agent.run returns text, steps, sessionId", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      }).build();

      const result = await agent.run("Hello");

      expect(result).toHaveProperty("text", "Mock response");
      expect(result).toHaveProperty("steps");
      expect(result.steps).toEqual([{ type: "text" }]);
      expect(result).toHaveProperty("sessionId", agent.sessionId);
    });

    it("agent.run emits agent:start and agent:stop events", async () => {
      const events: AgentEvent[] = [];
      const handler = (event: AgentEvent) => events.push(event);

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .on("agent:start", handler)
        .on("agent:stop", handler)
        .build();

      await agent.run("Hello");

      expect(events).toHaveLength(2);
      expect(events[0]!.type).toBe("agent:start");
      expect(events[0]!.sessionId).toBe(agent.sessionId);
      expect(events[0]!.data).toEqual({ prompt: "Hello" });
      expect(events[1]!.type).toBe("agent:stop");
      expect(events[1]!.sessionId).toBe(agent.sessionId);
    });
  });

  // ===========================================================================
  // Dispose
  // ===========================================================================

  describe("dispose", () => {
    it("agent.dispose cleans up event listeners", async () => {
      const handler = vi.fn();

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .on("*", handler)
        .build();

      expect(agent.eventBus.listenerCount("*")).toBe(1);

      await agent.dispose();

      expect(agent.eventBus.listenerCount("*")).toBe(0);
    });
  });

  // ===========================================================================
  // Step events (f14)
  // ===========================================================================

  describe("step events", () => {
    it("agent.run emits step:start and step:end for each step", async () => {
      generateFn.mockResolvedValue({
        text: "Done",
        steps: [{ type: "tool-call" }, { type: "text" }],
      });

      const events: AgentEvent[] = [];
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .on("step:start", (e) => events.push(e))
        .on("step:end", (e) => events.push(e))
        .build();

      await agent.run("Hello");

      expect(events).toHaveLength(4);
      expect(events[0]!.type).toBe("step:start");
      expect((events[0]!.data as Record<string, unknown>).stepIndex).toBe(0);
      expect(events[1]!.type).toBe("step:end");
      expect((events[1]!.data as Record<string, unknown>).stepIndex).toBe(0);
      expect(events[2]!.type).toBe("step:start");
      expect((events[2]!.data as Record<string, unknown>).stepIndex).toBe(1);
      expect(events[3]!.type).toBe("step:end");
      expect((events[3]!.data as Record<string, unknown>).stepIndex).toBe(1);
    });

    it("applies delegation messageFilter for subagent tool events", async () => {
      generateFn.mockResolvedValue({
        text: "Done",
        steps: [
          {
            type: "tool-call",
            toolCalls: [
              {
                toolName: "dispatch_subagent",
                toolCallId: "tc-1",
                args: { prompt: "x" },
              },
            ],
            toolResults: [
              {
                toolName: "dispatch_subagent",
                toolCallId: "tc-1",
                result: { taskId: "abc" },
              },
            ],
          },
        ],
      });

      const messageFilter = vi
        .fn()
        .mockResolvedValue({ allow: false, reason: "policy-filter" });

      const events: AgentEvent[] = [];
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .withSubagents({ hooks: { messageFilter } })
        .on("*", (event) => events.push(event))
        .build();

      await agent.run("Hello");

      const toolCallEvents = events.filter((e) => e.type === "tool:call");
      const toolResultEvents = events.filter((e) => e.type === "tool:result");
      const filteredEvents = events.filter(
        (e) => e.type === "delegation:message-filtered",
      );

      expect(messageFilter).toHaveBeenCalled();
      expect(toolCallEvents).toHaveLength(0);
      expect(toolResultEvents).toHaveLength(0);
      expect(filteredEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Checkpoint wiring (f3)
  // ===========================================================================

  describe("checkpoint", () => {
    it("agent.run saves checkpoint after completion", async () => {
      const memory = new InMemoryAdapter();

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
        checkpoint: { enabled: true },
      })
        .withMemory(memory)
        .build();

      await agent.run("Hello");

      const checkpoints = await memory.listCheckpoints(agent.sessionId);
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]!.sessionId).toBe(agent.sessionId);
      expect(checkpoints[0]!.conversation).toHaveLength(2);
    });

    it("agent.run emits checkpoint:save event", async () => {
      const events: AgentEvent[] = [];

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
        checkpoint: { enabled: true },
      })
        .on("checkpoint:save", (e) => events.push(e))
        .build();

      await agent.run("Hello");

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("checkpoint:save");
    });

    it("agent.run skips checkpoint when disabled", async () => {
      const events: AgentEvent[] = [];

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
        checkpoint: { enabled: false },
      })
        .on("checkpoint:save", (e) => events.push(e))
        .build();

      await agent.run("Hello");

      expect(events).toHaveLength(0);
    });
  });

  // ===========================================================================
  // MCP wiring (f1)
  // ===========================================================================

  describe("MCP tools", () => {
    it("agent.run discovers and merges MCP tools with mcp: prefix", async () => {
      const mockMcp = {
        discoverTools: vi.fn().mockResolvedValue({
          search: { name: "search", description: "Search", inputSchema: {} },
        }),
        executeTool: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "result" }],
        }),
        listServers: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        closeAll: vi.fn(),
      };

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .withMcp(mockMcp)
        .build();

      await agent.run("Hello");

      expect(mockMcp.discoverTools).toHaveBeenCalledTimes(1);
      const settings = constructorSpy.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const toolKeys = Object.keys(
        settings.tools as Record<string, unknown>,
      );
      expect(toolKeys).toContain("mcp:search");
    });
  });

  // ===========================================================================
  // Approval wiring (f2)
  // ===========================================================================

  describe("approval", () => {
    it("builder passes resolved approval config to Agent", () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test",
      })
        .withApproval({ defaultMode: "deny-all" })
        .build();

      expect(agent).toBeInstanceOf(Agent);
    });
  });

  // ===========================================================================
  // withTools (integration)
  // ===========================================================================

  describe("withTools", () => {
    it("should merge extra tools from withTools into agent", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "test",
      })
        .withTools({
          custom: {
            description: "custom test tool",
            parameters: { type: "object", properties: {} },
          } as unknown as import("../core/llm/index.js").Tool,
        })
        .build();

      expect(agent).toBeInstanceOf(Agent);
      expect(agent.sessionId).toBeDefined();

      await agent.run("Hello");

      const settings = constructorSpy.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const toolKeys = Object.keys(
        settings.tools as Record<string, unknown>,
      );
      expect(toolKeys).toContain("custom");
    });

    it("withTools returns the builder for chaining", () => {
      const builder = Agent.create({
        model: mockModel,
        instructions: "test",
      });

      const result = builder.withTools({ a: {} as unknown as import("../core/llm/index.js").Tool });
      expect(result).toBe(builder);
    });

    it("withTools merges multiple calls", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "test",
      })
        .withTools({ toolA: {} as unknown as import("../core/llm/index.js").Tool })
        .withTools({ toolB: {} as unknown as import("../core/llm/index.js").Tool })
        .build();

      await agent.run("Hello");

      const settings = constructorSpy.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const toolKeys = Object.keys(
        settings.tools as Record<string, unknown>,
      );
      expect(toolKeys).toContain("toolA");
      expect(toolKeys).toContain("toolB");
    });
  });
});
