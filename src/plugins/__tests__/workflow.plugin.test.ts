import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  WorkflowPlugin,
  WorkflowError,
  createWorkflowPlugin,
} from "../workflow.plugin.js";
import type { PluginContext } from "../../ports/plugin.port.js";
import type { WorkflowStep } from "../../domain/workflow.schema.js";
import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";

function createMockContext(): PluginContext {
  return {
    sessionId: "test-session",
    config: { instructions: "test", maxSteps: 10 },
    filesystem: new VirtualFilesystem(),
    memory: new InMemoryAdapter(),
    toolNames: ["tool1"],
  };
}

describe("WorkflowPlugin", () => {
  let ctx: PluginContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  describe("step execution", () => {
    it("should execute steps in order and accumulate context", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "step1",
            name: "Step 1",
            execute: async (ctx) => ({ ...ctx, a: 1 }),
          },
          {
            id: "step2",
            name: "Step 2",
            execute: async (ctx) => ({ ...ctx, b: 2 }),
          },
        ],
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      const result = plugin.getLastResult();
      expect(result).toBeDefined();
      expect(result!.status).toBe("completed");
      expect(result!.context).toEqual({ a: 1, b: 2 });
      expect(result!.completedSteps).toEqual(["step1", "step2"]);
    });

    it("should pass initial context to first step", async () => {
      const executeSpy = vi.fn().mockImplementation(async (ctx) => ctx);
      const plugin = new WorkflowPlugin({
        steps: [{ id: "s1", name: "S1", execute: executeSpy }],
        initialContext: { initial: "value" },
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ initial: "value" }),
      );
    });

    it("should handle empty steps list", async () => {
      const plugin = new WorkflowPlugin({ steps: [] });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      const result = plugin.getLastResult();
      expect(result!.status).toBe("completed");
      expect(result!.completedSteps).toEqual([]);
      expect(result!.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle single step workflow", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "only",
            name: "Only Step",
            execute: async () => ({ done: true }),
          },
        ],
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      const result = plugin.getLastResult();
      expect(result!.status).toBe("completed");
      expect(result!.completedSteps).toEqual(["only"]);
      expect(result!.context).toEqual({ done: true });
    });
  });

  describe("conditional steps", () => {
    it("should skip steps where condition returns false", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "step1",
            name: "Step 1",
            execute: async (ctx) => ({ ...ctx, a: 1 }),
          },
          {
            id: "step2",
            name: "Step 2",
            condition: () => false,
            execute: async (ctx) => ({ ...ctx, b: 2 }),
          },
          {
            id: "step3",
            name: "Step 3",
            execute: async (ctx) => ({ ...ctx, c: 3 }),
          },
        ],
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      const result = plugin.getLastResult();
      expect(result!.status).toBe("completed");
      expect(result!.completedSteps).toEqual(["step1", "step3"]);
      expect(result!.skippedSteps).toEqual(["step2"]);
      expect(result!.context).toEqual({ a: 1, c: 3 });
    });

    it("should evaluate condition with current context", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "step1",
            name: "Step 1",
            execute: async () => ({ flag: true }),
          },
          {
            id: "step2",
            name: "Step 2",
            condition: (ctx) => ctx.flag === true,
            execute: async (ctx) => ({ ...ctx, ran: true }),
          },
        ],
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      const result = plugin.getLastResult();
      expect(result!.completedSteps).toContain("step2");
      expect(result!.context).toEqual({ flag: true, ran: true });
    });
  });

  describe("retry", () => {
    it("should retry failed steps with configured attempts", async () => {
      let attempts = 0;
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "flaky",
            name: "Flaky Step",
            execute: async (ctx) => {
              attempts++;
              if (attempts < 3) throw new Error("fail");
              return { ...ctx, ok: true };
            },
            retry: { maxAttempts: 3, backoffMs: 1, backoffMultiplier: 1 },
          },
        ],
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      const result = plugin.getLastResult();
      expect(result!.status).toBe("completed");
      expect(attempts).toBe(3);
    });

    it("should fail after all retries are exhausted", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "always-fail",
            name: "Always Fail",
            execute: async () => {
              throw new Error("always fails");
            },
            retry: { maxAttempts: 2, backoffMs: 1, backoffMultiplier: 1 },
          },
        ],
      });

      await expect(
        plugin.hooks.beforeRun!(ctx, { prompt: "test" }),
      ).rejects.toThrow(WorkflowError);

      const result = plugin.getLastResult();
      expect(result!.status).toBe("failed");
      expect(result!.failedStep).toBe("always-fail");
      expect(result!.error).toBe("always fails");
    });
  });

  describe("rollback", () => {
    it("should rollback completed steps in reverse order on failure", async () => {
      const rollbackOrder: string[] = [];

      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "step1",
            name: "Step 1",
            execute: async (ctx) => ({ ...ctx, a: 1 }),
            rollback: async () => {
              rollbackOrder.push("step1");
            },
          },
          {
            id: "step2",
            name: "Step 2",
            execute: async (ctx) => ({ ...ctx, b: 2 }),
            rollback: async () => {
              rollbackOrder.push("step2");
            },
          },
          {
            id: "step3",
            name: "Step 3",
            execute: async () => {
              throw new Error("step3 failed");
            },
            retry: { maxAttempts: 1 },
          },
        ],
      });

      await expect(
        plugin.hooks.beforeRun!(ctx, { prompt: "test" }),
      ).rejects.toThrow(WorkflowError);

      expect(rollbackOrder).toEqual(["step2", "step1"]);
    });

    it("should swallow rollback errors and continue rolling back", async () => {
      const rollbackOrder: string[] = [];

      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "step1",
            name: "Step 1",
            execute: async (ctx) => ({ ...ctx, a: 1 }),
            rollback: async () => {
              rollbackOrder.push("step1");
            },
          },
          {
            id: "step2",
            name: "Step 2",
            execute: async (ctx) => ({ ...ctx, b: 2 }),
            rollback: async () => {
              rollbackOrder.push("step2");
              throw new Error("rollback error");
            },
          },
          {
            id: "step3",
            name: "Step 3",
            execute: async () => {
              throw new Error("step3 failed");
            },
            retry: { maxAttempts: 1 },
          },
        ],
      });

      await expect(
        plugin.hooks.beforeRun!(ctx, { prompt: "test" }),
      ).rejects.toThrow(WorkflowError);

      // Both rollbacks attempted despite step2's rollback throwing
      expect(rollbackOrder).toEqual(["step2", "step1"]);
    });
  });

  describe("WorkflowError", () => {
    it("should contain result with failedStep and completedSteps", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "ok",
            name: "OK",
            execute: async (ctx) => ({ ...ctx, ok: true }),
          },
          {
            id: "bad",
            name: "Bad",
            execute: async () => {
              throw new Error("boom");
            },
            retry: { maxAttempts: 1 },
          },
        ],
      });

      try {
        await plugin.hooks.beforeRun!(ctx, { prompt: "test" });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(WorkflowError);
        const we = err as WorkflowError;
        expect(we.name).toBe("WorkflowError");
        expect(we.result.failedStep).toBe("bad");
        expect(we.result.completedSteps).toEqual(["ok"]);
        expect(we.result.status).toBe("failed");
        expect(we.result.error).toBe("boom");
      }
    });
  });

  describe("getLastResult", () => {
    it("should return undefined before any run", () => {
      const plugin = new WorkflowPlugin({ steps: [] });
      expect(plugin.getLastResult()).toBeUndefined();
    });

    it("should return the result after a successful run", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "s1",
            name: "S1",
            execute: async () => ({ val: 42 }),
          },
        ],
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      const result = plugin.getLastResult();
      expect(result!.status).toBe("completed");
      expect(result!.context).toEqual({ val: 42 });
      expect(result!.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("prompt augmentation", () => {
    it("should augment prompt with workflow context", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "s1",
            name: "S1",
            execute: async () => ({ user: "alice", count: 5 }),
          },
        ],
      });

      const result = await plugin.hooks.beforeRun!(ctx, {
        prompt: "original prompt",
      });

      expect(result).toBeDefined();
      expect(result!.prompt).toContain("original prompt");
      expect(result!.prompt).toContain("--- Workflow Context ---");
      expect(result!.prompt).toContain('user: "alice"');
      expect(result!.prompt).toContain("count: 5");
    });
  });

  describe("factory", () => {
    it("should create a plugin via createWorkflowPlugin", async () => {
      const plugin = createWorkflowPlugin({
        steps: [
          {
            id: "s1",
            name: "S1",
            execute: async () => ({ created: true }),
          },
        ],
      });

      expect(plugin).toBeInstanceOf(WorkflowPlugin);
      expect(plugin.name).toBe("workflow");

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });
      expect(plugin.getLastResult()!.status).toBe("completed");
    });
  });

  describe("context isolation", () => {
    it("should deep-clone initialContext to prevent cross-run mutation", async () => {
      const nested = { items: [1, 2] };
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "mutate",
            name: "Mutate",
            execute: async (ctx) => {
              (ctx.nested as { items: number[] }).items.push(3);
              return ctx;
            },
          },
        ],
        initialContext: { nested },
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "run1" });
      const r1 = plugin.getLastResult();
      expect((r1!.context.nested as { items: number[] }).items).toEqual([1, 2, 3]);

      await plugin.hooks.beforeRun!(ctx, { prompt: "run2" });
      const r2 = plugin.getLastResult();
      // Without deep clone, this would be [1,2,3,3]
      expect((r2!.context.nested as { items: number[] }).items).toEqual([1, 2, 3]);
      // Original should be untouched
      expect(nested.items).toEqual([1, 2]);
    });
  });

  describe("totalDurationMs", () => {
    it("should track total duration", async () => {
      const plugin = new WorkflowPlugin({
        steps: [
          {
            id: "s1",
            name: "S1",
            execute: async (ctx) => {
              await new Promise((r) => setTimeout(r, 10));
              return { ...ctx, done: true };
            },
          },
        ],
      });

      await plugin.hooks.beforeRun!(ctx, { prompt: "test" });

      const result = plugin.getLastResult();
      expect(result!.totalDurationMs).toBeGreaterThanOrEqual(5);
    });
  });
});
