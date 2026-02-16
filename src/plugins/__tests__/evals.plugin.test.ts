import { describe, expect, it, vi, beforeEach } from "vitest";
import { EvalsPlugin, type EvalScorer } from "../evals.plugin.js";
import type { PluginContext } from "../../ports/plugin.port.js";
import { createMockContext } from "../../__tests__/helpers/test-utils.js";

describe("EvalsPlugin", () => {
  let mockMemory: { saveMetadata: ReturnType<typeof vi.fn> };
  let ctx: PluginContext;

  beforeEach(() => {
    ctx = createMockContext();
    mockMemory = { saveMetadata: vi.fn() };
    ctx.memory = mockMemory as any;
  });

  describe("metrics collection", () => {
    it("should collect latency, step count, and tool counts through lifecycle", async () => {
      const plugin = new EvalsPlugin();
      const startTime = Date.now();

      // Before run
      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });

      // Simulate some tool calls
      plugin.hooks.afterTool!(ctx, { toolName: "tool1" });
      plugin.hooks.afterTool!(ctx, { toolName: "tool1" });
      plugin.hooks.afterTool!(ctx, { toolName: "tool2" });

      // Simulate a small delay
      await new Promise(resolve => setTimeout(resolve, 10));

      // After run
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [{ step: 1 }, { step: 2 }],
          sessionId: "test-session"
        }
      });

      const result = plugin.getLastResult();
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe("test-session");
      expect(result!.prompt).toBe("test prompt");
      expect(result!.output).toBe("test output");
      expect(result!.metrics.stepCount).toBe(2);
      expect(result!.metrics.toolCalls).toEqual({ tool1: 2, tool2: 1 });
      expect(result!.metrics.latencyMs).toBeGreaterThan(0);
      expect(result!.createdAt).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe("custom scorers", () => {
    it("should run custom scorers and include scores", async () => {
      const testScorer: EvalScorer = {
        name: "test",
        score: () => 0.8
      };

      const plugin = new EvalsPlugin({
        scorers: [testScorer]
      });

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      const result = plugin.getLastResult();
      expect(result!.metrics.customScores.test).toBe(0.8);
    });

    it("should handle scorer errors with -1 score", async () => {
      const errorScorer: EvalScorer = {
        name: "error",
        score: () => {
          throw new Error("Scorer error");
        }
      };

      const plugin = new EvalsPlugin({
        scorers: [errorScorer]
      });

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      const result = plugin.getLastResult();
      expect(result!.metrics.customScores.error).toBe(-1);
    });

    it("should handle async scorers", async () => {
      const asyncScorer: EvalScorer = {
        name: "async",
        score: async () => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return 0.9;
        }
      };

      const plugin = new EvalsPlugin({
        scorers: [asyncScorer]
      });

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      const result = plugin.getLastResult();
      expect(result!.metrics.customScores.async).toBe(0.9);
    });
  });

  describe("persistence", () => {
    it("should save metadata when persist=true", async () => {
      const plugin = new EvalsPlugin({ persist: true });

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      expect(mockMemory.saveMetadata).toHaveBeenCalledWith(
        "test-session",
        expect.stringMatching(/^eval:/),
        expect.objectContaining({
          sessionId: "test-session",
          prompt: "test prompt",
          output: "test output"
        })
      );
    });

    it("should not save metadata when persist=false", async () => {
      const plugin = new EvalsPlugin({ persist: false });

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      expect(mockMemory.saveMetadata).not.toHaveBeenCalled();
    });
  });

  describe("onEval callback", () => {
    it("should invoke onEval callback with result", async () => {
      const onEvalSpy = vi.fn();
      const plugin = new EvalsPlugin({ onEval: onEvalSpy });

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      expect(onEvalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "test-session",
          prompt: "test prompt",
          output: "test output"
        })
      );
    });

    it("should handle async onEval callback", async () => {
      const onEvalSpy = vi.fn().mockResolvedValue(undefined);
      const plugin = new EvalsPlugin({ onEval: onEvalSpy });

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      expect(onEvalSpy).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should clean state on run phase error", () => {
      const plugin = new EvalsPlugin();

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      
      // Verify state exists
      plugin.hooks.afterTool!(ctx, { toolName: "tool1" });

      plugin.hooks.onError!(ctx, { 
        phase: "run", 
        error: new Error("Test error") 
      });

      // After error, subsequent afterRun should not find state
      plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      const result = plugin.getLastResult();
      expect(result!.metrics.toolCalls).toEqual({});
    });

    it("should not clean state on non-run phase errors", () => {
      const plugin = new EvalsPlugin();

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      plugin.hooks.afterTool!(ctx, { toolName: "tool1" });

      plugin.hooks.onError!(ctx, { 
        phase: "tool", 
        error: new Error("Tool error") 
      });

      plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [],
          sessionId: "test-session"
        }
      });

      const result = plugin.getLastResult();
      expect(result!.metrics.toolCalls).toEqual({ tool1: 1 });
    });
  });

  describe("result management", () => {
    it("should return all results with getResults", async () => {
      const plugin = new EvalsPlugin();

      // First run
      plugin.hooks.beforeRun!(ctx, { prompt: "prompt 1" });
      await plugin.hooks.afterRun!(ctx, {
        result: { text: "output 1", steps: [], sessionId: "session-1" }
      });

      // Second run 
      plugin.hooks.beforeRun!(ctx, { prompt: "prompt 2" });
      await plugin.hooks.afterRun!(ctx, {
        result: { text: "output 2", steps: [], sessionId: "session-2" }
      });

      const results = plugin.getResults();
      expect(results).toHaveLength(2);
      expect(results[0].prompt).toBe("prompt 1");
      expect(results[1].prompt).toBe("prompt 2");
    });

    it("should return last result with getLastResult", async () => {
      const plugin = new EvalsPlugin();

      plugin.hooks.beforeRun!(ctx, { prompt: "prompt 1" });
      await plugin.hooks.afterRun!(ctx, {
        result: { text: "output 1", steps: [], sessionId: "session-1" }
      });

      plugin.hooks.beforeRun!(ctx, { prompt: "prompt 2" });
      await plugin.hooks.afterRun!(ctx, {
        result: { text: "output 2", steps: [], sessionId: "session-2" }
      });

      const lastResult = plugin.getLastResult();
      expect(lastResult!.prompt).toBe("prompt 2");
    });

    it("should return undefined when no results exist", () => {
      const plugin = new EvalsPlugin();
      expect(plugin.getLastResult()).toBeUndefined();
    });

    it("should clear results", async () => {
      const plugin = new EvalsPlugin();

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: { text: "test output", steps: [], sessionId: "test-session" }
      });

      expect(plugin.getResults()).toHaveLength(1);
      
      plugin.clearResults();
      
      expect(plugin.getResults()).toHaveLength(0);
      expect(plugin.getLastResult()).toBeUndefined();
    });
  });

  describe("token usage extraction", () => {
    it("should extract token usage from steps", async () => {
      const plugin = new EvalsPlugin();

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [
            { usage: { promptTokens: 10, completionTokens: 5 } },
            { usage: { promptTokens: 20, completionTokens: 15 } },
            { noUsage: true }, // Step without usage
          ],
          sessionId: "test-session"
        }
      });

      const result = plugin.getLastResult();
      expect(result!.metrics.tokenUsage).toEqual({
        prompt: 30,
        completion: 20,
        total: 50
      });
    });

    it("should handle steps without usage", async () => {
      const plugin = new EvalsPlugin();

      plugin.hooks.beforeRun!(ctx, { prompt: "test prompt" });
      await plugin.hooks.afterRun!(ctx, {
        result: {
          text: "test output",
          steps: [{ step: 1 }, { step: 2 }],
          sessionId: "test-session"
        }
      });

      const result = plugin.getLastResult();
      expect(result!.metrics.tokenUsage).toEqual({
        prompt: 0,
        completion: 0,
        total: 0
      });
    });
  });
});