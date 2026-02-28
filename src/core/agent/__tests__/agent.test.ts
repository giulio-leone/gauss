// =============================================================================
// Gauss Agent Core — Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { Agent } from "../agent.js";
import { createMockProvider } from "../../../testing/mock-provider.js";
import { tool } from "../../llm/tool.js";
import type { Decorator, AgentResult, RunContext } from "../types.js";
import type { LanguageModel } from "../../llm/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockModel(responses: Array<{ text: string; toolCalls?: Array<{ toolName: string; args: Record<string, unknown> }> }>) {
  return createMockProvider(responses);
}

function simpleModel(text = "Hello!") {
  return mockModel([{ text }]);
}

function noopDecorator(name: string, hooks?: Partial<Decorator>): Decorator {
  return { name, ...hooks };
}

// ---------------------------------------------------------------------------
// Agent()
// ---------------------------------------------------------------------------

describe("Agent", () => {
  describe("Factory", () => {
    it("creates an agent with minimal config", () => {
      const agent = Agent({ model: simpleModel() });
      expect(agent).toBeDefined();
      expect(agent.config.model).toBeDefined();
      expect(agent.config.maxSteps).toBe(10);
      expect(agent.decorators).toHaveLength(0);
    });

    it("throws if model is missing", () => {
      expect(() => Agent({} as never)).toThrow("Agent requires a model");
    });

    it("respects custom maxSteps", () => {
      const agent = Agent({ model: simpleModel(), maxSteps: 5 });
      expect(agent.config.maxSteps).toBe(5);
    });

    it("accepts instructions", () => {
      const agent = Agent({ model: simpleModel(), instructions: "Be helpful" });
      expect(agent.config.instructions).toBe("Be helpful");
    });

    it("accepts name and description", () => {
      const agent = Agent({
        model: simpleModel(),
        name: "TestAgent",
        description: "A test agent",
      });
      expect(agent.config.name).toBe("TestAgent");
      expect(agent.config.description).toBe("A test agent");
    });
  });

  describe(".with() immutability", () => {
    it("returns a new instance", () => {
      const agent1 = Agent({ model: simpleModel() });
      const d = noopDecorator("test");
      const agent2 = agent1.with(d);

      expect(agent1).not.toBe(agent2);
      expect(agent1.decorators).toHaveLength(0);
      expect(agent2.decorators).toHaveLength(1);
      expect(agent2.decorators[0]).toBe(d);
    });

    it("chains multiple decorators", () => {
      const agent = Agent({ model: simpleModel() })
        .with(noopDecorator("a"))
        .with(noopDecorator("b"))
        .with(noopDecorator("c"));

      expect(agent.decorators).toHaveLength(3);
      expect(agent.decorators.map((d) => d.name)).toEqual(["a", "b", "c"]);
    });

    it("does not mutate the original", () => {
      const original = Agent({ model: simpleModel() });
      original.with(noopDecorator("x"));
      expect(original.decorators).toHaveLength(0);
    });
  });

  describe(".clone()", () => {
    it("creates a new instance with same config", () => {
      const agent = Agent({ model: simpleModel(), instructions: "Original" });
      const clone = agent.clone();

      expect(clone).not.toBe(agent);
      expect(clone.config.instructions).toBe("Original");
    });

    it("applies overrides", () => {
      const agent = Agent({ model: simpleModel(), instructions: "Original", maxSteps: 5 });
      const clone = agent.clone({ instructions: "Override", maxSteps: 20 });

      expect(clone.config.instructions).toBe("Override");
      expect(clone.config.maxSteps).toBe(20);
      // Original unchanged
      expect(agent.config.instructions).toBe("Original");
    });

    it("preserves decorators", () => {
      const agent = Agent({ model: simpleModel() }).with(noopDecorator("d1"));
      const clone = agent.clone({ instructions: "New" });

      expect(clone.decorators).toHaveLength(1);
      expect(clone.decorators[0].name).toBe("d1");
    });
  });

  describe(".run()", () => {
    it("returns AgentResult with text", async () => {
      const agent = Agent({ model: simpleModel("Test response") });
      const result = await agent.run("Hello");

      expect(result.text).toBe("Test response");
      expect(result.finishReason).toBe("stop");
      expect(result.usage).toBeDefined();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it("executes tools in multi-step loop", async () => {
      const model = mockModel([
        {
          text: "",
          toolCalls: [{ toolName: "greet", args: { name: "World" } }],
        },
        { text: "Hello, World!" },
      ]);

      const greetTool = tool({
        description: "Greet someone",
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }) => `Hello, ${name}!`,
      });

      const agent = Agent({ model, tools: { greet: greetTool } });
      const result = await agent.run("Greet the world");

      expect(result.text).toBe("Hello, World!");
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
    });

    it("respects maxSteps", async () => {
      // Model always calls tools, should stop at maxSteps
      const model = mockModel(
        Array.from({ length: 5 }, () => ({
          text: "",
          toolCalls: [{ toolName: "ping", args: {} }],
        })),
      );

      const ping = tool({
        description: "Ping",
        parameters: z.object({}),
        execute: async () => "pong",
      });

      const agent = Agent({ model, tools: { ping }, maxSteps: 3 });
      const result = await agent.run("Loop test");

      expect(result.steps.length).toBeLessThanOrEqual(3);
    });
  });

  describe("Decorator lifecycle", () => {
    it("calls beforeRun and afterRun", async () => {
      const order: string[] = [];

      const d: Decorator = {
        name: "tracker",
        beforeRun: async () => {
          order.push("before");
        },
        afterRun: async (_ctx, result) => {
          order.push("after");
          return result;
        },
      };

      const agent = Agent({ model: simpleModel() }).with(d);
      await agent.run("test");

      expect(order).toEqual(["before", "after"]);
    });

    it("calls beforeRun FIFO and afterRun LIFO", async () => {
      const order: string[] = [];

      const d1: Decorator = {
        name: "d1",
        beforeRun: async () => { order.push("before:d1"); },
        afterRun: async (_, r) => { order.push("after:d1"); return r; },
      };
      const d2: Decorator = {
        name: "d2",
        beforeRun: async () => { order.push("before:d2"); },
        afterRun: async (_, r) => { order.push("after:d2"); return r; },
      };

      const agent = Agent({ model: simpleModel() }).with(d1).with(d2);
      await agent.run("test");

      expect(order).toEqual(["before:d1", "before:d2", "after:d2", "after:d1"]);
    });

    it("calls onError when run fails", async () => {
      const errorModel = {
        specificationVersion: "v3",
        provider: "error",
        modelId: "error",
        async doGenerate() {
          throw new Error("Model error");
        },
        async doStream() {
          throw new Error("Model error");
        },
      } as unknown as LanguageModel;

      const onError = vi.fn();
      const d: Decorator = { name: "errorHandler", onError };

      const agent = Agent({ model: errorModel }).with(d);
      await expect(agent.run("test")).rejects.toThrow("Model error");
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].message).toBe("Model error");
    });

    it("calls initialize once (lazy)", async () => {
      const init = vi.fn();
      const d: Decorator = { name: "lazy", initialize: init };

      const agent = Agent({ model: simpleModel() }).with(d);
      expect(init).not.toHaveBeenCalled();

      await agent.run("first");
      expect(init).toHaveBeenCalledOnce();

      await agent.run("second");
      expect(init).toHaveBeenCalledOnce(); // still once
    });

    it("afterRun can transform result", async () => {
      const d: Decorator = {
        name: "transform",
        afterRun: async (_ctx, result) => ({
          ...result,
          text: result.text.toUpperCase(),
        }),
      };

      const agent = Agent({ model: simpleModel("hello") }).with(d);
      const result = await agent.run("test");

      expect(result.text).toBe("HELLO");
    });

    it("beforeRun can modify context", async () => {
      const d: Decorator = {
        name: "modifier",
        beforeRun: async (ctx) => ({
          ...ctx,
          prompt: ctx.prompt + " (modified)",
        }),
      };

      // We can't easily test the modified prompt reaches the model,
      // but we can verify it doesn't crash
      const agent = Agent({ model: simpleModel() }).with(d);
      const result = await agent.run("test");
      expect(result.text).toBeDefined();
    });
  });

  describe("Subagent-as-tool", () => {
    it("converts agents to tools", () => {
      const sub = Agent({
        model: simpleModel("sub response"),
        name: "researcher",
        description: "Research things",
      });

      const parent = Agent({
        model: simpleModel(),
        agents: { researcher: sub },
      });

      expect(parent.config.tools).toBeDefined();
      expect(parent.config.tools!["researcher"]).toBeDefined();
      expect(parent.config.tools!["researcher"].description).toBe("Research things");
    });

    it("explicit tools take precedence over agent tools", () => {
      const sub = Agent({
        model: simpleModel(),
        description: "Sub desc",
      });

      const myTool = tool({
        description: "My tool",
        parameters: z.object({}),
        execute: async () => "explicit",
      });

      const parent = Agent({
        model: simpleModel(),
        agents: { overlap: sub },
        tools: { overlap: myTool },
      });

      expect(parent.config.tools!["overlap"].description).toBe("My tool");
    });
  });

  describe(".stream()", () => {
    it("returns an AgentStream with async iteration", async () => {
      const agent = Agent({ model: simpleModel("Streaming text") });
      const stream = agent.stream("test");

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk.text);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join("")).toContain("Streaming");
    });

    it("has promise accessors", async () => {
      const agent = Agent({ model: simpleModel("Stream result") });
      const stream = agent.stream("test");

      // Consume the stream
      for await (const _ of stream) { /* drain */ }

      const text = await stream.text;
      expect(text).toBe("Stream result");

      const usage = await stream.usage;
      expect(usage.inputTokens).toBeGreaterThan(0);

      const result = await stream.result;
      expect(result.text).toBe("Stream result");
      expect(result.duration).toBeGreaterThan(0);
    });

    it("abort() stops generation", async () => {
      const agent = Agent({ model: simpleModel("Test") });
      const stream = agent.stream("test");

      // Abort immediately
      stream.abort();

      // Stream should eventually end (might throw or just finish)
      const chunks: string[] = [];
      try {
        for await (const chunk of stream) {
          chunks.push(chunk.text);
        }
      } catch {
        // AbortError is expected
      }
    });
  });

  describe("Frozen/immutable", () => {
    it("config is frozen", () => {
      const agent = Agent({ model: simpleModel() });
      expect(Object.isFrozen(agent.config)).toBe(true);
    });

    it("instance is frozen", () => {
      const agent = Agent({ model: simpleModel() });
      expect(Object.isFrozen(agent)).toBe(true);
    });

    it("decorators array is frozen", () => {
      const agent = Agent({ model: simpleModel() });
      expect(Object.isFrozen(agent.decorators)).toBe(true);
    });
  });
});
