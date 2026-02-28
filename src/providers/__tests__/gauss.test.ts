import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  gauss,
  gaussAgentRun,
  gaussAgentStream,
  gaussFallback,
  createNativeMiddlewareChain,
  nativeMiddleware,
  nativeBenchmark,
  nativeBenchmarkCompare,
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
    streamCallback(JSON.stringify({ type: "step_start", step: 0 }));
    streamCallback(JSON.stringify({ type: "text_delta", step: 0, delta: "Hello " }));
    streamCallback(JSON.stringify({ type: "text_delta", step: 0, delta: "World!" }));
    streamCallback(JSON.stringify({ type: "done", text: "Hello World!", steps: 1, inputTokens: 10, outputTokens: 5 }));
    return { text: "Hello World!", steps: 1, inputTokens: 10, outputTokens: 5, structuredOutput: null };
  }),
  countTokens: vi.fn(() => 5),
  countTokensForModel: vi.fn(() => 6),
  cosineSimilarity: vi.fn(() => 0.95),
  createFallbackProvider: vi.fn(() => 99),
  createMiddlewareChain: vi.fn(() => 77),
  middlewareUseLogging: vi.fn(),
  middlewareUseCaching: vi.fn(),
  destroyMiddlewareChain: vi.fn(),
  // Guardrails
  createGuardrailChain: vi.fn(() => 88),
  guardrailChainAddContentModeration: vi.fn(),
  guardrailChainAddPiiDetection: vi.fn(),
  guardrailChainAddTokenLimit: vi.fn(),
  guardrailChainAddRegexFilter: vi.fn(),
  guardrailChainAddSchema: vi.fn(),
  destroyGuardrailChain: vi.fn(),
  // Telemetry
  createTelemetry: vi.fn(() => 66),
  telemetryRecordSpan: vi.fn(),
  telemetryExportSpans: vi.fn(() => []),
  telemetryExportMetrics: vi.fn(() => ({})),
  telemetryClear: vi.fn(),
  destroyTelemetry: vi.fn(),
  // Resilience
  createCircuitBreaker: vi.fn(() => 55),
  createResilientProvider: vi.fn(() => 44),
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

  describe("gaussFallback()", () => {
    it("throws if no providers given", () => {
      expect(() => gaussFallback({ providers: [] })).toThrow("at least one provider");
    });

    it("returns single provider unchanged", () => {
      const model = gauss("openai", "gpt-4o", { apiKey: "test-key" });
      const fallback = gaussFallback({ providers: [model] });
      expect(fallback).toBe(model);
    });

    it("creates fallback chain via NAPI", () => {
      const m1 = gauss("openai", "gpt-4o", { apiKey: "k1" });
      const m2 = gauss("anthropic", "claude-sonnet-4-20250514", { apiKey: "k2" });
      const fallback = gaussFallback({ providers: [m1, m2] });

      expect(mockNapi.createFallbackProvider).toHaveBeenCalledWith([42, 42]);
      expect(fallback.provider).toBe("gauss-fallback");
      expect(fallback.modelId).toContain("fallback:");
    });
  });

  describe("createNativeMiddlewareChain()", () => {
    it("creates chain with logging", () => {
      const chain = createNativeMiddlewareChain({ logging: true });
      expect(mockNapi.createMiddlewareChain).toHaveBeenCalled();
      expect(mockNapi.middlewareUseLogging).toHaveBeenCalledWith(77);
      expect(chain.handle).toBe(77);
      chain.destroy();
      expect(mockNapi.destroyMiddlewareChain).toHaveBeenCalledWith(77);
    });

    it("creates chain with caching", () => {
      const chain = createNativeMiddlewareChain({ caching: { ttlMs: 5000 } });
      expect(mockNapi.middlewareUseCaching).toHaveBeenCalledWith(77, 5000);
      chain.destroy();
    });

    it("creates chain with both logging and caching", () => {
      mockNapi.middlewareUseLogging.mockClear();
      mockNapi.middlewareUseCaching.mockClear();
      const chain = createNativeMiddlewareChain({ logging: true, caching: { ttlMs: 10000 } });
      expect(mockNapi.middlewareUseLogging).toHaveBeenCalled();
      expect(mockNapi.middlewareUseCaching).toHaveBeenCalledWith(77, 10000);
      chain.destroy();
    });

    it("creates chain with guardrails", () => {
      const chain = createNativeMiddlewareChain({
        guardrail: {
          contentModeration: { threshold: 0.8 },
          piiDetection: { action: "mask" },
          tokenLimit: { maxTokens: 4096 },
          regexFilter: { pattern: "secret", action: "block" },
        },
      });
      expect(mockNapi.createGuardrailChain).toHaveBeenCalled();
      expect(mockNapi.guardrailChainAddContentModeration).toHaveBeenCalledWith(88, 0.8);
      expect(mockNapi.guardrailChainAddPiiDetection).toHaveBeenCalledWith(88, "mask");
      expect(mockNapi.guardrailChainAddTokenLimit).toHaveBeenCalledWith(88, 4096);
      expect(mockNapi.guardrailChainAddRegexFilter).toHaveBeenCalledWith(88, "secret", "block");
      expect(chain.guardrailHandle).toBe(88);
      chain.destroy();
      expect(mockNapi.destroyGuardrailChain).toHaveBeenCalledWith(88);
    });

    it("creates chain with telemetry", () => {
      const chain = createNativeMiddlewareChain({
        telemetry: { enabled: true },
      });
      expect(mockNapi.createTelemetry).toHaveBeenCalled();
      expect(chain.telemetryHandle).toBe(66);
      chain.destroy();
      expect(mockNapi.destroyTelemetry).toHaveBeenCalledWith(66);
    });

    it("creates chain with all features", () => {
      mockNapi.middlewareUseLogging.mockClear();
      mockNapi.middlewareUseCaching.mockClear();
      mockNapi.createGuardrailChain.mockClear();
      mockNapi.createTelemetry.mockClear();
      const chain = createNativeMiddlewareChain({
        logging: true,
        caching: { ttlMs: 30000 },
        guardrail: { contentModeration: { threshold: 0.9 } },
        telemetry: { enabled: true },
      });
      expect(mockNapi.middlewareUseLogging).toHaveBeenCalled();
      expect(mockNapi.middlewareUseCaching).toHaveBeenCalled();
      expect(mockNapi.createGuardrailChain).toHaveBeenCalled();
      expect(mockNapi.createTelemetry).toHaveBeenCalled();
      chain.destroy();
    });
  });

  describe("nativeMiddleware() decorator", () => {
    it("returns a decorator with name, initialize, and destroy", () => {
      const decorator = nativeMiddleware({ logging: true });
      expect(decorator.name).toBe("native-middleware");

      const ctx = decorator.initialize!();
      expect(ctx.middlewareChainHandle).toBe(77);

      decorator.destroy!(ctx);
      expect(mockNapi.destroyMiddlewareChain).toHaveBeenCalledWith(77);
    });
  });

  describe("nativeBenchmark()", () => {
    it("benchmarks a sync function", () => {
      let counter = 0;
      const result = nativeBenchmark("increment", 100, () => { counter++; });
      expect(result.name).toBe("increment");
      expect(result.iterations).toBe(100);
      expect(result.totalMs).toBeGreaterThan(0);
      expect(result.avgMs).toBeGreaterThan(0);
      expect(result.opsPerSec).toBeGreaterThan(0);
      // 100 iterations + 10 warmup
      expect(counter).toBe(110);
    });
  });

  describe("nativeBenchmarkCompare()", () => {
    it("compares native vs JS and returns speedup", () => {
      const result = nativeBenchmarkCompare(
        "cos-sim",
        50,
        () => cosineSimilarity([1, 0], [0, 1]),
        () => {
          // JS fallback
          const a = [1, 0], b = [0, 1];
          let dot = 0, na = 0, nb = 0;
          for (let i = 0; i < a.length; i++) {
            dot += a[i]! * b[i]!;
            na += a[i]! * a[i]!;
            nb += b[i]! * b[i]!;
          }
          return dot / (Math.sqrt(na) * Math.sqrt(nb));
        },
      );
      expect(result.native.name).toBe("cos-sim (native)");
      expect(result.js.name).toBe("cos-sim (js)");
      expect(typeof result.speedup).toBe("number");
      expect(result.speedup).toBeGreaterThan(0);
    });
  });
});
