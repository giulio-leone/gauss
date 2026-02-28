import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel, Tool } from "ai";

import { Agent } from "../agent/agent.js";

const { generateFn, constructorSpy } = vi.hoisted(() => {
  const generateFn = vi.fn().mockResolvedValue({
    text: "plugin-test",
    steps: [{ type: "text" }],
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
    stream = vi.fn();
  }

  return {
    ...actual,
    ToolLoopAgent: MockToolLoopAgent,
  };
});

const mockModel = {
  modelId: "mock-model",
  provider: "mock",
} as unknown as LanguageModel;

describe("Agent + Plugins integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateFn.mockResolvedValue({ text: "plugin-test", steps: [{ type: "text" }] });
  });

  it("applies beforeRun and beforeStep/afterStep hooks", async () => {
    const beforeStep = vi.fn(async () => undefined);
    const afterStep = vi.fn(async () => undefined);

    const agent = Agent.create({
      model: mockModel,
      instructions: "Test plugin lifecycle",
    })
      .withPlugin({
        name: "lifecycle-plugin",
        hooks: {
          beforeRun: async (_ctx, params) => ({ prompt: `[plugin] ${params.prompt}` }),
          beforeStep,
          afterStep,
        },
      })
      .build();

    generateFn.mockResolvedValueOnce({
      text: "done",
      steps: [{ type: "tool-call" }, { type: "text" }],
    });

    const result = await agent.run("start");

    expect(generateFn).toHaveBeenCalledWith({ prompt: "[plugin] start" });
    expect(beforeStep).toHaveBeenCalledTimes(2);
    expect(afterStep).toHaveBeenCalledTimes(2);
    expect(result.steps).toHaveLength(2);
  });

  it("injects plugin tools and runs beforeTool/afterTool hooks", async () => {
    const executeSpy = vi.fn(async (args: { left: number; right: number }) => {
      return args.left + args.right;
    });
    const beforeTool = vi.fn(async () => ({ args: { left: 4, right: 5 } }));
    const afterTool = vi.fn(async () => undefined);

    generateFn.mockImplementationOnce(async () => {
      const settings = constructorSpy.mock.calls[0]?.[0] as {
        tools: Record<string, { execute?: (args: unknown) => Promise<unknown> }>;
      };

      await settings.tools["math:add"]?.execute?.({ left: 1, right: 1 });

      return {
        text: "tool complete",
        steps: [{ type: "tool-call" }],
      };
    });

    const agent = Agent.create({
      model: mockModel,
      instructions: "Test tool hooks",
    })
      .withPlugin({
        name: "math-plugin",
        tools: {
          "math:add": {
            description: "Add two numbers",
            execute: executeSpy,
          } as unknown as Tool,
        },
        hooks: {
          beforeTool,
          afterTool,
        },
      })
      .build();

    await agent.run("sum numbers");

    expect(executeSpy).toHaveBeenCalledWith({ left: 4, right: 5 });
    expect(beforeTool).toHaveBeenCalledTimes(1);
    expect(afterTool).toHaveBeenCalledTimes(1);
  });

  it("supports onError suppression", async () => {
    generateFn.mockRejectedValueOnce(new Error("boom"));

    const agent = Agent.create({
      model: mockModel,
      instructions: "Suppress errors",
    })
      .withPlugin({
        name: "error-plugin",
        hooks: {
          onError: async () => ({ suppress: true }),
        },
      })
      .build();

    const result = await agent.run("trigger");

    expect(result).toEqual({ text: "", steps: [], toolCalls: [], sessionId: agent.sessionId });
  });
});
