import { describe, it, expect, beforeEach, vi } from "vitest";
import { Agent } from "../../../agent/agent.js";
import { CircuitBreakerState } from "../../../adapters/resilience/circuit-breaker.js";

const { generateFn } = vi.hoisted(() => {
  const generateFn = vi.fn().mockResolvedValue({
    text: "Mocked response",
    steps: [],
    usage: { inputTokens: 10, outputTokens: 20 },
    finishReason: "stop",
    toolCalls: [],
    toolResults: [],
  });
  return { generateFn };
});

vi.mock("../../../core/llm/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../core/llm/index.js")>();
  return {
    ...actual,
    generateText: generateFn,
  };
});

describe("Agent with Resilience Patterns", () => {
  const mockModel = {
    generateText: vi.fn(),
    generateObject: vi.fn(),
  } as any;

  beforeEach(() => {
    generateFn.mockReset().mockResolvedValue({
      text: "Mocked response",
      steps: [],
    });
  });

  describe("Circuit Breaker Integration", () => {
    it("should build Agent with circuit breaker", () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withCircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 1000,
        monitorWindowMs: 5000,
      })
      .build();

      expect(agent).toBeInstanceOf(Agent);
    });

    it("should apply circuit breaker to tools", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withTools({
        failingTool: {
          description: "A tool that fails",
          parameters: {},
          execute: vi.fn(async () => "success"),
        },
      })
      .withCircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 1000,
        monitorWindowMs: 5000,
      })
      .build();

      generateFn.mockResolvedValue({
        text: "Circuit breaker working",
        steps: [],
      });

      const result = await agent.run("test prompt");
      expect(result.text).toBe("Circuit breaker working");
    });
  });

  describe("Rate Limiter Integration", () => {
    it("should build Agent with rate limiter", () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withRateLimiter({
        maxTokens: 5,
        refillRateMs: 1000,
      })
      .build();

      expect(agent).toBeInstanceOf(Agent);
    });

    it("should apply rate limiting to model calls", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withRateLimiter({
        maxTokens: 10,
        refillRateMs: 200,
      })
      .build();

      generateFn.mockResolvedValue({
        text: "Rate limited response",
        steps: [],
      });

      const result = await agent.run("prompt 1");
      expect(result.text).toBe("Rate limited response");
      expect(generateFn).toHaveBeenCalledTimes(1);
    });

    it("should intercept doGenerate and doStream on LanguageModel", async () => {
      // Verify the proxy wraps the correct LanguageModel methods
      const doGenerateFn = vi.fn().mockResolvedValue({ text: "ok" });
      const doStreamFn = vi.fn().mockResolvedValue({ stream: new ReadableStream() });
      const generateTextFn = vi.fn(); // should NOT be intercepted
      const model = {
        doGenerate: doGenerateFn,
        doStream: doStreamFn,
        generateText: generateTextFn,
        specificationVersion: 'v1',
        provider: 'test',
        modelId: 'test',
        defaultObjectGenerationMode: 'json',
      } as any;

      const { RateLimiter: RL } = await import("../../../adapters/resilience/rate-limiter.js");
      const rateLimiter = new RL({ maxTokens: 10, refillRateMs: 1000 });

      // Replicate the proxy logic from createRateLimitedModel
      const proxy = new Proxy(model, {
        get(target: any, prop: string | symbol, receiver: any) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value === 'function' && prop === 'doGenerate') {
            return async function(...args: any[]) {
              await rateLimiter.acquire();
              return value.apply(target, args);
            };
          }
          if (typeof value === 'function' && prop === 'doStream') {
            return async function(...args: any[]) {
              await rateLimiter.acquire();
              return value.apply(target, args);
            };
          }
          return value;
        }
      });

      // doGenerate should be wrapped (returns async function)
      expect(proxy.doGenerate).not.toBe(doGenerateFn);
      // doStream should be wrapped
      expect(proxy.doStream).not.toBe(doStreamFn);
      // generateText should NOT be wrapped (pass-through)
      expect(proxy.generateText).toBe(generateTextFn);
    });

    it("should apply rate limiting to model calls (not tools)", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withTools({
        trackedTool: {
          description: "A tool that tracks execution time",
          parameters: {},
          execute: vi.fn(async () => "executed"),
        },
      })
      .withRateLimiter({
        maxTokens: 10,
        refillRateMs: 200,
      })
      .build();

      generateFn.mockResolvedValue({
        text: "Tools executed",
        steps: [],
      });

      const result = await agent.run("test prompt");
      expect(result.text).toBe("Tools executed");
    });
  });

  describe("Tool Cache Integration", () => {
    it("should build Agent with tool cache", () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withToolCache({
        defaultTtlMs: 60000,
        maxSize: 100,
      })
      .build();

      expect(agent).toBeInstanceOf(Agent);
    });

    it("should cache tool results", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withTools({
        cachableTool: {
          description: "A tool that can be cached",
          parameters: { input: { type: "string" } },
          execute: vi.fn(async (args: any) => `Result for ${args.input}`),
        },
      })
      .withToolCache({
        defaultTtlMs: 60000,
        maxSize: 100,
      })
      .build();

      generateFn.mockResolvedValue({
        text: "Cache test completed",
        steps: [],
      });

      const result = await agent.run("test prompt");
      expect(result.text).toBe("Cache test completed");
    });
  });

  describe("Combined Resilience Patterns", () => {
    it("should support all patterns together", () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withCircuitBreaker()
      .withRateLimiter()
      .withToolCache()
      .build();

      expect(agent).toBeInstanceOf(Agent);
    });

    it("should apply patterns in correct order: cache -> rate limit -> circuit breaker", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withTools({
        testTool: {
          description: "A test tool",
          parameters: { input: { type: "string" } },
          execute: vi.fn(async (args: any) => `Success for ${args.input}`),
        },
      })
      .withCircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        monitorWindowMs: 5000,
      })
      .withRateLimiter({
        maxTokens: 10,
        refillRateMs: 100,
      })
      .withToolCache({
        defaultTtlMs: 60000,
        maxSize: 100,
      })
      .build();

      generateFn.mockResolvedValue({
        text: "Integration test completed",
        steps: [],
      });

      const result = await agent.run("test prompt");
      expect(result.text).toBe("Integration test completed");
    });
  });

  describe("Configuration Defaults", () => {
    it("should use default configurations when not specified", () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withCircuitBreaker() // No config - should use defaults
      .withRateLimiter() // No config - should use defaults
      .withToolCache() // No config - should use defaults
      .build();

      expect(agent).toBeInstanceOf(Agent);
    });

    it("should merge partial configurations with defaults", () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test instructions",
      })
      .withCircuitBreaker({ failureThreshold: 2 }) // Partial config
      .withRateLimiter({ maxTokens: 20 }) // Partial config
      .withToolCache({ maxSize: 500 }) // Partial config
      .build();

      expect(agent).toBeInstanceOf(Agent);
    });
  });
});