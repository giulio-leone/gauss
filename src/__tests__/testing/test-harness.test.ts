import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "ai";

import {
  createMockProvider,
  type MockResponse,
} from "../../testing/mock-provider.js";
import {
  runAgentTest,
  type AgentTestResult,
} from "../../testing/agent-test-runner.js";
import {
  assertToolCalled,
  assertToolNotCalled,
  assertResponseContains,
  assertResponseMatches,
  assertMaxSteps,
  assertMaxTokens,
} from "../../testing/assertions.js";
import { createSnapshot, compareSnapshots } from "../../testing/snapshot.js";
import { DeepAgent } from "../../agent/deep-agent.js";

// =============================================================================
// Mock AI SDK — ToolLoopAgent (same pattern as deep-agent.test.ts)
// =============================================================================

const { generateFn, constructorSpy } = vi.hoisted(() => {
  const generateFn = vi.fn().mockResolvedValue({
    text: "Mock response",
    steps: [],
  });
  const constructorSpy = vi.fn();
  return { generateFn, constructorSpy };
});

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();

  class MockToolLoopAgent {
    constructor(settings: Record<string, unknown>) {
      constructorSpy(settings);
    }
    generate = generateFn;
  }

  return { ...actual, ToolLoopAgent: MockToolLoopAgent };
});

// =============================================================================
// createMockProvider
// =============================================================================

describe("createMockProvider", () => {
  it("returns a LanguageModelV3-compatible object", () => {
    const provider = createMockProvider([{ text: "hello" }]);

    expect(provider.specificationVersion).toBe("v3");
    expect(provider.provider).toBe("mock-provider");
    expect(provider.modelId).toBe("mock-model");
    expect(typeof provider.doGenerate).toBe("function");
    expect(typeof provider.doStream).toBe("function");
  });

  it("doGenerate returns canned responses in order", async () => {
    const responses: MockResponse[] = [
      { text: "first", usage: { inputTokens: 5, outputTokens: 10 } },
      { text: "second", usage: { inputTokens: 15, outputTokens: 20 } },
    ];

    const provider = createMockProvider(responses);
    const options = { inputFormat: "prompt" as const, mode: { type: "regular" as const }, prompt: [], abortSignal: new AbortController().signal };

    const r1 = await provider.doGenerate(options as any);
    expect(r1.text).toBe("first");
    expect(r1.usage).toEqual({ inputTokens: 5, outputTokens: 10 });

    const r2 = await provider.doGenerate(options as any);
    expect(r2.text).toBe("second");
    expect(r2.usage).toEqual({ inputTokens: 15, outputTokens: 20 });
  });

  it("doGenerate repeats last response when exhausted", async () => {
    const provider = createMockProvider([{ text: "only" }]);
    const options = {} as any;

    const r1 = await provider.doGenerate(options);
    const r2 = await provider.doGenerate(options);
    expect(r1.text).toBe("only");
    expect(r2.text).toBe("only");
  });

  it("doGenerate includes tool calls when specified", async () => {
    const provider = createMockProvider([{
      text: "",
      toolCalls: [{ toolName: "search", args: { query: "test" } }],
    }]);

    const result = await provider.doGenerate({} as any);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toMatchObject({
      toolCallType: "function",
      toolName: "search",
    });
    expect(JSON.parse(result.toolCalls![0]!.args)).toEqual({ query: "test" });
    expect(result.finishReason).toBe("tool-calls");
  });

  it("doGenerate uses default usage when not specified", async () => {
    const provider = createMockProvider([{ text: "hi" }]);
    const result = await provider.doGenerate({} as any);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it("doStream returns a readable stream", async () => {
    const provider = createMockProvider([{ text: "streamed" }]);
    const result = await provider.doStream({} as any);

    expect(result.stream).toBeInstanceOf(ReadableStream);
    const reader = result.stream.getReader();
    const chunks: unknown[] = [];
    let done = false;
    while (!done) {
      const read = await reader.read();
      if (read.done) {
        done = true;
      } else {
        chunks.push(read.value);
      }
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2); // text-delta + finish
    expect((chunks[0] as any).type).toBe("text-delta");
    expect((chunks[0] as any).textDelta).toBe("streamed");
  });

  it("throws if no responses configured", async () => {
    const provider = createMockProvider([]);
    await expect(provider.doGenerate({} as any)).rejects.toThrow("no responses configured");
  });
});

// =============================================================================
// runAgentTest
// =============================================================================

describe("runAgentTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures response text", async () => {
    generateFn.mockResolvedValue({
      text: "Agent reply",
      steps: [],
    });

    const mockModel = { modelId: "test", provider: "test" } as unknown as LanguageModel;
    const agent = DeepAgent.create({ model: mockModel, instructions: "Test" }).build();

    const result = await runAgentTest({ agent, prompt: "Hello" });

    expect(result.response).toBe("Agent reply");
    expect(result.steps).toBe(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("captures step count", async () => {
    generateFn.mockResolvedValue({
      text: "Done",
      steps: [{ type: "tool-call" }, { type: "text" }],
    });

    const mockModel = { modelId: "test", provider: "test" } as unknown as LanguageModel;
    const agent = DeepAgent.create({ model: mockModel, instructions: "Test" }).build();

    const result = await runAgentTest({ agent, prompt: "Hello" });

    expect(result.steps).toBe(2);
  });

  it("captures token usage from steps", async () => {
    generateFn.mockResolvedValue({
      text: "Done",
      steps: [
        { type: "text", usage: { promptTokens: 50, completionTokens: 30 } },
        { type: "text", usage: { promptTokens: 10, completionTokens: 5 } },
      ],
    });

    const mockModel = { modelId: "test", provider: "test" } as unknown as LanguageModel;
    const agent = DeepAgent.create({ model: mockModel, instructions: "Test" }).build();

    const result = await runAgentTest({ agent, prompt: "Hello" });

    expect(result.tokenUsage).toEqual({ input: 60, output: 35 });
  });

  it("returns empty tool calls when none made", async () => {
    generateFn.mockResolvedValue({ text: "No tools", steps: [] });

    const mockModel = { modelId: "test", provider: "test" } as unknown as LanguageModel;
    const agent = DeepAgent.create({ model: mockModel, instructions: "Test" }).build();

    const result = await runAgentTest({ agent, prompt: "Hello" });

    expect(result.toolCalls).toEqual([]);
  });
});

// =============================================================================
// Assertions
// =============================================================================

describe("assertions", () => {
  const makeResult = (overrides?: Partial<AgentTestResult>): AgentTestResult => ({
    response: "Hello world",
    toolCalls: [
      { name: "search", args: { query: "test" }, result: "found" },
      { name: "write", args: { path: "/a.txt" }, result: "ok" },
    ],
    tokenUsage: { input: 100, output: 50 },
    duration: 500,
    steps: 3,
    ...overrides,
  });

  describe("assertToolCalled", () => {
    it("passes when tool was called", () => {
      expect(() => assertToolCalled(makeResult(), "search")).not.toThrow();
    });

    it("passes when tool called with matching args", () => {
      expect(() => assertToolCalled(makeResult(), "search", { query: "test" })).not.toThrow();
    });

    it("fails when tool was not called", () => {
      expect(() => assertToolCalled(makeResult(), "delete")).toThrow(
        'Expected tool "delete" to be called',
      );
    });

    it("fails when args don't match", () => {
      expect(() => assertToolCalled(makeResult(), "search", { query: "other" })).toThrow(
        'Tool "search" was called with',
      );
    });
  });

  describe("assertToolNotCalled", () => {
    it("passes when tool was not called", () => {
      expect(() => assertToolNotCalled(makeResult(), "delete")).not.toThrow();
    });

    it("fails when tool was called", () => {
      expect(() => assertToolNotCalled(makeResult(), "search")).toThrow(
        'Expected tool "search" NOT to be called',
      );
    });
  });

  describe("assertResponseContains", () => {
    it("passes when response contains substring", () => {
      expect(() => assertResponseContains(makeResult(), "world")).not.toThrow();
    });

    it("fails when response does not contain substring", () => {
      expect(() => assertResponseContains(makeResult(), "missing")).toThrow(
        'Expected response to contain "missing"',
      );
    });
  });

  describe("assertResponseMatches", () => {
    it("passes when response matches pattern", () => {
      expect(() => assertResponseMatches(makeResult(), /Hello/)).not.toThrow();
    });

    it("fails when response does not match pattern", () => {
      expect(() => assertResponseMatches(makeResult(), /^Goodbye/)).toThrow(
        "Expected response to match",
      );
    });
  });

  describe("assertMaxSteps", () => {
    it("passes when steps within limit", () => {
      expect(() => assertMaxSteps(makeResult(), 5)).not.toThrow();
    });

    it("passes when steps equal to limit", () => {
      expect(() => assertMaxSteps(makeResult(), 3)).not.toThrow();
    });

    it("fails when steps exceed limit", () => {
      expect(() => assertMaxSteps(makeResult(), 2)).toThrow(
        "Expected at most 2 steps, but got 3",
      );
    });
  });

  describe("assertMaxTokens", () => {
    it("passes when tokens within limit", () => {
      expect(() => assertMaxTokens(makeResult(), 200)).not.toThrow();
    });

    it("passes when tokens equal to limit", () => {
      expect(() => assertMaxTokens(makeResult(), 150)).not.toThrow();
    });

    it("fails when tokens exceed limit", () => {
      expect(() => assertMaxTokens(makeResult(), 100)).toThrow(
        "Expected at most 100 total tokens, but used 150",
      );
    });
  });
});

// =============================================================================
// Snapshot
// =============================================================================

describe("snapshot", () => {
  const makeResult = (): AgentTestResult => ({
    response: "Hello",
    toolCalls: [
      { name: "search", args: { q: "test" }, result: "found" },
    ],
    tokenUsage: { input: 10, output: 20 },
    duration: 500,
    steps: 2,
  });

  describe("createSnapshot", () => {
    it("creates deterministic JSON", () => {
      const snap1 = createSnapshot(makeResult());
      const snap2 = createSnapshot(makeResult());
      expect(snap1).toBe(snap2);
    });

    it("excludes duration (non-deterministic)", () => {
      const snap = createSnapshot(makeResult());
      expect(snap).not.toContain("duration");
    });

    it("includes response, steps, tokenUsage, toolCalls", () => {
      const snap = createSnapshot(makeResult());
      const parsed = JSON.parse(snap);
      expect(parsed).toHaveProperty("response", "Hello");
      expect(parsed).toHaveProperty("steps", 2);
      expect(parsed).toHaveProperty("tokenUsage");
      expect(parsed).toHaveProperty("toolCalls");
      expect(parsed.toolCalls).toHaveLength(1);
    });

    it("sorts tool call keys alphabetically", () => {
      const snap = createSnapshot(makeResult());
      const parsed = JSON.parse(snap);
      const keys = Object.keys(parsed.toolCalls[0]);
      expect(keys).toEqual(["args", "name", "result"]);
    });
  });

  describe("compareSnapshots", () => {
    it("returns match:true for identical snapshots", () => {
      const snap = createSnapshot(makeResult());
      const result = compareSnapshots(snap, snap);
      expect(result.match).toBe(true);
      expect(result.diff).toBeUndefined();
    });

    it("returns match:false with diff for different snapshots", () => {
      const snap1 = createSnapshot(makeResult());
      const modified = { ...makeResult(), response: "Goodbye" };
      const snap2 = createSnapshot(modified);

      const result = compareSnapshots(snap1, snap2);
      expect(result.match).toBe(false);
      expect(result.diff).toBeDefined();
      expect(result.diff).toContain("Hello");
      expect(result.diff).toContain("Goodbye");
    });

    it("handles different lengths", () => {
      const result = compareSnapshots("a\nb", "a\nb\nc");
      expect(result.match).toBe(false);
      expect(result.diff).toContain("c");
    });
  });
});
