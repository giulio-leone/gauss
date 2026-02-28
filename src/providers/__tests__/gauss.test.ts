import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  gauss,
  gaussAgentRun,
  gaussAgentStream,
  countTokens,
  countTokensForModel,
  cosineSimilarity,
  isNativeAvailable,
  nativeVersion,
  setNapi,
} from "../gauss.js";

const mockNapi = {
  version: vi.fn(() => "0.6.0"),
  createProvider: vi.fn(() => 42),
  destroyProvider: vi.fn(),
  generate: vi.fn(async () => ({
    text: "Hello from Rust!",
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason: "Stop",
  })),
  generateWithTools: vi.fn(async () => ({
    text: "",
    toolCalls: [
      { id: "call_1", name: "weather", args: { city: "Rome" } },
    ],
    usage: { inputTokens: 15, outputTokens: 8 },
    finishReason: "ToolCalls",
  })),
  agentRunWithToolExecutor: vi.fn(async (_name: string, _handle: number, _tools: any[], _msgs: any[], _opts: any, executor: (s: string) => Promise<string>) => {
    const result = await executor(JSON.stringify({ tool: "weather", args: { city: "Rome" } }));
    return {
      text: `Weather result: ${result}`,
      steps: 2,
      inputTokens: 20,
      outputTokens: 10,
      structuredOutput: null,
    };
  }),
  agentStreamWithToolExecutor: vi.fn(async (_name: string, _handle: number, _tools: any[], _msgs: any[], _opts: any, streamCallback: (s: string) => void, _toolExecutor: any) => {
    // Simulate streaming events
    streamCallback(JSON.stringify({ type: "step_start", step: 0 }));
    streamCallback(JSON.stringify({ type: "text_delta", step: 0, delta: "Hello " }));
    streamCallback(JSON.stringify({ type: "text_delta", step: 0, delta: "World!" }));
    streamCallback(JSON.stringify({ type: "done", text: "Hello World!", steps: 1, inputTokens: 10, outputTokens: 5 }));
    return { text: "Hello World!", steps: 1, inputTokens: 10, outputTokens: 5, structuredOutput: null };
  }),
  countTokens: vi.fn(() => 5),
  countTokensForModel: vi.fn(() => 6),
  cosineSimilarity: vi.fn(() => 0.95),
};

describe("GaussProvider", () => {
  beforeAll(() => {
    setNapi(mockNapi as any);
  });

  afterAll(() => {
    setNapi(null);
  });

  describe("gauss() factory", () => {
    it("creates a LanguageModel with correct properties", () => {
      const model = gauss("openai", "gpt-4o", { apiKey: "test-key" });
      expect(model.provider).toBe("gauss-openai");
      expect(model.modelId).toBe("gpt-4o");
      expect(model.specificationVersion).toBe("v1");
      expect(model.getHandle()).toBe(42);
    });

    it("calls NAPI createProvider with correct args", () => {
      gauss("anthropic", "claude-3", {
        apiKey: "ak-123",
        baseUrl: "https://custom.api",
        timeoutMs: 5000,
      });
      expect(mockNapi.createProvider).toHaveBeenCalledWith(
        "anthropic",
        "claude-3",
        expect.objectContaining({
          apiKey: "ak-123",
          baseUrl: "https://custom.api",
          timeoutMs: 5000,
        }),
      );
    });
  });

  describe("doGenerate()", () => {
    it("generates text without tools", async () => {
      const model = gauss("openai", "gpt-4o", { apiKey: "test-key" });
      const result = await model.doGenerate({
        inputFormat: "messages",
        mode: { type: "regular" },
        prompt: [{ role: "user", content: "Hello" }],
      });

      expect(result.text).toBe("Hello from Rust!");
      expect(result.finishReason).toBe("stop");
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
    });

    it("generates with tools and returns tool calls", async () => {
      const model = gauss("openai", "gpt-4o", { apiKey: "test-key" });
      const result = await model.doGenerate({
        inputFormat: "messages",
        mode: {
          type: "regular",
          tools: [
            {
              type: "function",
              name: "weather",
              description: "Get weather",
              parameters: { type: "object", properties: { city: { type: "string" } } },
            },
          ],
        },
        prompt: [{ role: "user", content: "Weather in Rome?" }],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].toolName).toBe("weather");
      expect(result.finishReason).toBe("tool-calls");
    });
  });

  describe("doStream()", () => {
    it("streams text via native NAPI callback", async () => {
      const model = gauss("openai", "gpt-4o", { apiKey: "test-key" });
      const { stream } = await model.doStream({
        inputFormat: "messages",
        mode: { type: "regular" },
        prompt: [{ role: "user", content: "Hello" }],
      });

      const chunks: unknown[] = [];
      const reader = stream.getReader();
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) chunks.push(value);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const textChunks = chunks.filter((c: any) => c.type === "text-delta");
      expect(textChunks.length).toBe(2);
      expect((textChunks[0] as any).textDelta).toBe("Hello ");
      expect((textChunks[1] as any).textDelta).toBe("World!");
      const finishChunk = chunks.find((c: any) => c.type === "finish") as any;
      expect(finishChunk).toBeDefined();
      expect(finishChunk.usage.inputTokens).toBe(10);
      expect(finishChunk.usage.outputTokens).toBe(5);
    });
  });

  describe("gaussAgentRun()", () => {
    it("runs agent with tool executor callback", async () => {
      const weatherTool = {
        name: "weather",
        description: "Get weather info",
        parameters: { type: "object", properties: { city: { type: "string" } } },
        execute: async (args: Record<string, unknown>) => ({
          temperature: 22,
          city: args.city,
          condition: "sunny",
        }),
      };

      const result = await gaussAgentRun(
        "test-agent",
        42,
        [weatherTool],
        [{ role: "user", content: "Weather in Rome?" }],
        { instructions: "You are helpful", maxSteps: 5 },
      );

      expect(result.text).toContain("Weather result:");
      expect(result.steps).toBe(2);
      expect(result.usage.inputTokens).toBe(20);
      expect(result.usage.outputTokens).toBe(10);

      // Verify the executor was called with the right tool call
      expect(mockNapi.agentRunWithToolExecutor).toHaveBeenCalled();
    });

    it("tool executor receives correct args and returns JSON", async () => {
      const executeSpy = vi.fn(async (args: Record<string, unknown>) => ({
        result: `Weather for ${args.city}`,
      }));

      await gaussAgentRun(
        "test-agent",
        42,
        [{
          name: "weather",
          description: "Get weather",
          execute: executeSpy,
        }],
        [{ role: "user", content: "?" }],
      );

      expect(executeSpy).toHaveBeenCalledWith({ city: "Rome" });
    });
  });

  describe("gaussAgentStream()", () => {
    it("streams events via async iterator", async () => {
      const { events, result } = gaussAgentStream(
        "test-agent",
        42,
        [],
        [{ role: "user", content: "Hello" }],
      );

      const collectedEvents: any[] = [];
      for await (const event of events) {
        collectedEvents.push(event);
        if (event.type === "done") break;
      }

      expect(collectedEvents.length).toBe(4);
      expect(collectedEvents[0].type).toBe("step_start");
      expect(collectedEvents[1].type).toBe("text_delta");
      expect(collectedEvents[1].delta).toBe("Hello ");
      expect(collectedEvents[2].type).toBe("text_delta");
      expect(collectedEvents[2].delta).toBe("World!");
      expect(collectedEvents[3].type).toBe("done");

      const finalResult = await result;
      expect(finalResult.text).toBe("Hello World!");
      expect(finalResult.steps).toBe(1);
    });
  });

  describe("native utilities", () => {
    it("countTokens delegates to NAPI", () => {
      expect(countTokens("hello world")).toBe(5);
      expect(mockNapi.countTokens).toHaveBeenCalledWith("hello world");
    });

    it("countTokensForModel delegates to NAPI", () => {
      expect(countTokensForModel("hello", "gpt-4")).toBe(6);
    });

    it("cosineSimilarity delegates to NAPI", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0.95);
    });

    it("nativeVersion returns version string", () => {
      expect(nativeVersion()).toBe("0.6.0");
    });
  });

  describe("destroy()", () => {
    it("calls NAPI destroyProvider", () => {
      const model = gauss("openai", "gpt-4o", { apiKey: "test-key" });
      model.destroy();
      expect(mockNapi.destroyProvider).toHaveBeenCalledWith(42);
    });
  });
});
