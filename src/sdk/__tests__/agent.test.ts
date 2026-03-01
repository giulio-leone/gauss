/**
 * Unit tests for Gauss SDK — Agent module.
 *
 * Mocks the gauss-napi module so tests run without the native binary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("gauss-napi", () => ({
  version: vi.fn(() => "1.0.0-test"),
  create_provider: vi.fn(() => 42),
  destroy_provider: vi.fn(),
  agent_run: vi.fn(async () => ({
    text: "Hello from Rust core",
    steps: 1,
    inputTokens: 10,
    outputTokens: 20,
    structuredOutput: undefined,
  })),
  agent_run_with_tool_executor: vi.fn(async () => ({
    text: "Tool result",
    steps: 2,
    inputTokens: 15,
    outputTokens: 25,
  })),
  agent_stream_with_tool_executor: vi.fn(async () => ({
    text: "Streamed",
    steps: 1,
    inputTokens: 5,
    outputTokens: 10,
  })),
  generate: vi.fn(async () => ({ text: "raw response" })),
  generate_with_tools: vi.fn(async () => ({ text: "tool response" })),
  generate_image: vi.fn(async () => ({
    images: [{ url: "https://example.com/img.png", mimeType: "image/png" }],
    revisedPrompt: "A beautiful sunset over mountains",
  })),
}));

import { Agent, gauss } from "../agent.js";
import { batch } from "../batch.js";
import type { StreamEvent } from "../stream-iter.js";
import { version, generateImage } from "../code-execution.js";
import {
  create_provider,
  destroy_provider,
  agent_run,
  agent_run_with_tool_executor,
} from "gauss-napi";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Agent", () => {
  describe("constructor", () => {
    it("creates an agent with minimal config", () => {
      const agent = new Agent({ instructions: "Be helpful" });
      expect(agent.name).toBe("agent");
      expect(create_provider).toHaveBeenCalledOnce();
      agent.destroy();
    });

    it("creates an agent with full config", () => {
      const agent = new Agent({
        name: "test-agent",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        providerOptions: { apiKey: "sk-test" },
        instructions: "You are a test agent",
        temperature: 0.5,
        maxSteps: 5,
      });
      expect(agent.name).toBe("test-agent");
      expect(agent.provider).toBe("anthropic");
      expect(agent.model).toBe("claude-sonnet-4-20250514");
      expect(create_provider).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-20250514", {
        apiKey: "sk-test",
      });
      agent.destroy();
    });

    it("auto-detects provider from environment", () => {
      process.env.OPENAI_API_KEY = "sk-env-test";
      const agent = new Agent();
      expect(agent.provider).toBe("openai");
      expect(agent.model).toBe("gpt-5.2");
      delete process.env.OPENAI_API_KEY;
      agent.destroy();
    });
  });

  describe("run", () => {
    it("accepts a string prompt", async () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      const result = await agent.run("Hello");
      expect(result.text).toBe("Hello from Rust core");
      expect(agent_run).toHaveBeenCalledWith(
        "agent",
        42,
        [],
        [{ role: "user", content: "Hello" }],
        expect.any(Object)
      );
      agent.destroy();
    });

    it("accepts a message array", async () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      const messages = [
        { role: "system" as const, content: "Be brief" },
        { role: "user" as const, content: "Hi" },
      ];
      await agent.run(messages);
      expect(agent_run).toHaveBeenCalledWith("agent", 42, [], messages, expect.any(Object));
      agent.destroy();
    });

    it("returns AgentResult with token usage", async () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      const result = await agent.run("test");
      expect(result.steps).toBe(1);
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);
      agent.destroy();
    });
  });

  describe("runWithTools", () => {
    it("passes tool executor to NAPI", async () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      agent.addTool({ name: "search", description: "Search" });
      const executor = vi.fn(async () => '{"result":"ok"}');
      await agent.runWithTools("query", executor);
      expect(agent_run_with_tool_executor).toHaveBeenCalledWith(
        "agent",
        42,
        [{ name: "search", description: "Search" }],
        [{ role: "user", content: "query" }],
        expect.any(Object),
        executor
      );
      agent.destroy();
    });
  });

  describe("fluent API", () => {
    it("supports chaining addTool and setOptions", () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      const result = agent
        .addTool({ name: "t1", description: "tool 1" })
        .addTools([{ name: "t2", description: "tool 2" }])
        .setOptions({ temperature: 0.8 });
      expect(result).toBe(agent);
      agent.destroy();
    });
  });

  describe("lifecycle", () => {
    it("destroy releases resources", () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      agent.destroy();
      expect(destroy_provider).toHaveBeenCalledWith(42);
    });

    it("double destroy is safe", () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      agent.destroy();
      agent.destroy();
      expect(destroy_provider).toHaveBeenCalledOnce();
    });

    it("throws on run after destroy", async () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      agent.destroy();
      await expect(agent.run("test")).rejects.toThrow('Agent "agent" has been destroyed');
    });

    it("Symbol.dispose works", () => {
      const agent = new Agent({ providerOptions: { apiKey: "k" } });
      agent[Symbol.dispose]();
      expect(destroy_provider).toHaveBeenCalledOnce();
    });
  });

  describe("static methods", () => {
    it("version returns core version", () => {
      expect(version()).toBe("1.0.0-test");
    });
  });
});

describe("gauss (quick-start)", () => {
  it("returns text for a simple prompt", async () => {
    const result = await gauss("Hello");
    expect(result).toBe("Hello from Rust core");
    expect(create_provider).toHaveBeenCalledOnce();
    expect(destroy_provider).toHaveBeenCalledOnce();
  });

  it("accepts provider options", async () => {
    await gauss("Hello", { provider: "anthropic", model: "claude-sonnet-4-20250514" });
    expect(create_provider).toHaveBeenCalledWith(
      "anthropic",
      "claude-sonnet-4-20250514",
      expect.any(Object)
    );
  });

  it("destroys agent even on error", async () => {
    vi.mocked(agent_run).mockRejectedValueOnce(new Error("boom"));
    await expect(gauss("fail")).rejects.toThrow("boom");
    expect(destroy_provider).toHaveBeenCalledOnce();
  });
});

describe("AgentStream", () => {
  it("yields events as async iterable", async () => {
    const { agent_stream_with_tool_executor: mockStream } = await import("gauss-napi");
    vi.mocked(mockStream).mockImplementation(async (_name, _h, _t, _m, _o, onEvent, _exec) => {
      onEvent?.('{"type":"text_delta","text":"Hello"}');
      onEvent?.('{"type":"text_delta","text":" World"}');
      return { text: "Hello World", steps: 1, inputTokens: 5, outputTokens: 10 };
    });
    const agent = new Agent({ providerOptions: { apiKey: "k" } });
    const executor = vi.fn(async () => "{}");
    const events: StreamEvent[] = [];
    const stream = agent.streamIter("Hello", executor);
    for await (const event of stream) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0].text).toBe("Hello");
    expect(events[1].text).toBe(" World");
    expect(stream.result?.text).toBe("Hello World");
    agent.destroy();
  });
});

describe("batch", () => {
  it("runs multiple prompts in parallel", async () => {
    const results = await batch(["p1", "p2", "p3"], { concurrency: 2 });
    expect(results).toHaveLength(3);
    results.forEach(r => {
      expect(r.result?.text).toBe("Hello from Rust core");
      expect(r.error).toBeUndefined();
    });
  });

  it("captures errors per item without failing batch", async () => {
    vi.mocked(agent_run)
      .mockResolvedValueOnce({ text: "ok", steps: 1, inputTokens: 5, outputTokens: 5 })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ text: "ok2", steps: 1, inputTokens: 5, outputTokens: 5 });
    const results = await batch(["a", "b", "c"], { concurrency: 1 });
    expect(results[0].result?.text).toBe("ok");
    expect(results[1].error?.message).toBe("boom");
    expect(results[2].result?.text).toBe("ok2");
  });

  it("respects concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    vi.mocked(agent_run).mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
      return { text: "ok", steps: 1, inputTokens: 1, outputTokens: 1 };
    });
    await batch(["a", "b", "c", "d"], { concurrency: 2 });
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});

// ─── Grounding & Image Generation ──────────────────────────────────

describe("Agent grounding options", () => {
  it("passes grounding option to NAPI", async () => {
    const agent = new Agent({ grounding: true });
    await agent.run("test with grounding");
    const call = vi.mocked(agent_run).mock.calls[0];
    expect(call[4]?.grounding).toBe(true);
    agent.destroy();
  });

  it("passes nativeCodeExecution option", async () => {
    const agent = new Agent({ nativeCodeExecution: true });
    await agent.run("test with code execution");
    const call = vi.mocked(agent_run).mock.calls[0];
    expect(call[4]?.nativeCodeExecution).toBe(true);
    agent.destroy();
  });

  it("passes responseModalities option", async () => {
    const agent = new Agent({ responseModalities: ["TEXT", "IMAGE"] });
    await agent.run("generate an image");
    const call = vi.mocked(agent_run).mock.calls[0];
    expect(call[4]?.responseModalities).toEqual(["TEXT", "IMAGE"]);
    agent.destroy();
  });
});

describe("generateImage", () => {
  it("generates images via standalone function", async () => {
    const result = await generateImage("A sunset", {
      model: "dall-e-3",
      size: "1024x1024",
    });
    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe("https://example.com/img.png");
    expect(result.revisedPrompt).toBe("A beautiful sunset over mountains");
  });
});

describe("GroundingMetadata type", () => {
  it("type structure matches expected shape", () => {
    const metadata: import("../types.js").GroundingMetadata = {
      searchQueries: ["what is rust"],
      groundingChunks: [{ url: "https://example.com", title: "Rust" }],
      searchEntryPoint: "<div>widget</div>",
    };
    expect(metadata.searchQueries).toHaveLength(1);
    expect(metadata.groundingChunks[0].url).toBe("https://example.com");
    expect(metadata.searchEntryPoint).toBe("<div>widget</div>");
  });
});

describe("Agent reasoning options", () => {
  it("reasoningEffort is set in options", () => {
    const agent = new Agent({
      name: "test-reasoning",
      model: "o4-mini",
      reasoningEffort: "high",
    });
    // @ts-ignore - accessing private for test
    expect(agent._options.reasoningEffort).toBe("high");
    agent.destroy();
  });
});

describe("ImageGeneration types", () => {
  it("ImageGenerationConfig has correct structure", () => {
    const config: import("../types.js").ImageGenerationConfig = {
      model: "dall-e-3",
      size: "1024x1024",
      quality: "hd",
      style: "vivid",
      n: 1,
    };
    expect(config.model).toBe("dall-e-3");
    expect(config.size).toBe("1024x1024");
  });

  it("ImageGenerationResult has correct structure", () => {
    const result: import("../types.js").ImageGenerationResult = {
      images: [{ url: "https://img.png", mimeType: "image/png" }],
      revisedPrompt: "revised",
    };
    expect(result.images).toHaveLength(1);
    expect(result.revisedPrompt).toBe("revised");
  });
});
