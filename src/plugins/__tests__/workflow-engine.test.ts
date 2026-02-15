import { describe, it, expect, vi, beforeEach } from "vitest";
import { DefaultWorkflowEngine } from "../../adapters/workflow/default-workflow.engine.js";
import { defineWorkflow } from "../../domain/workflow.builder.js";
import type { WorkflowDefinition, WorkflowStep, WorkflowContext } from "../../domain/workflow.schema.js";

describe("DefaultWorkflowEngine", () => {
  let engine: DefaultWorkflowEngine;

  beforeEach(() => {
    engine = new DefaultWorkflowEngine();
  });

  describe("Sequential steps", () => {
    it("should execute sequential steps successfully", async () => {
      const definition: WorkflowDefinition = {
        id: "test-workflow",
        name: "Test Sequential",
        steps: [
          {
            id: "step1",
            name: "First Step",
            execute: async (ctx) => ({ ...ctx, step1: "completed" }),
          },
          {
            id: "step2", 
            name: "Second Step",
            execute: async (ctx) => ({ ...ctx, step2: "completed" }),
          },
        ],
      };

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context).toEqual({
        step1: "completed",
        step2: "completed",
      });
      expect(result.completedSteps).toEqual(["step1", "step2"]);
      expect(result.skippedSteps).toEqual([]);
    });

    it("should skip steps with false conditions", async () => {
      const definition: WorkflowDefinition = {
        id: "test-conditional",
        name: "Test Conditional Skip",
        steps: [
          {
            id: "step1",
            name: "Always Execute",
            execute: async (ctx) => ({ ...ctx, executed: true }),
          },
          {
            id: "step2",
            name: "Never Execute",
            condition: () => false,
            execute: async (ctx) => ({ ...ctx, shouldNotExecute: true }),
          },
        ],
      };

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context).toEqual({ executed: true });
      expect(result.completedSteps).toEqual(["step1"]);
      expect(result.skippedSteps).toEqual(["step2"]);
    });
  });

  describe("Parallel steps", () => {
    it("should execute parallel branches with 'all' merge strategy", async () => {
      const definition = defineWorkflow("parallel-test", "Parallel Test")
        .parallel("parallel1", "Parallel Execution", [
          {
            id: "branch1",
            name: "Branch 1",
            execute: async (ctx) => ({ ...ctx, branch1Result: "success" }),
          },
          {
            id: "branch2", 
            name: "Branch 2",
            execute: async (ctx) => ({ ...ctx, branch2Result: "success" }),
          },
        ], "all")
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.branch1Result).toBe("success");
      expect(result.context.branch2Result).toBe("success");
      expect(result.completedSteps).toEqual(["parallel1"]);
    });

    it("should execute parallel branches with 'first' merge strategy", async () => {
      const definition = defineWorkflow("parallel-first", "Parallel First")
        .parallel("parallel1", "Parallel First", [
          {
            id: "fast-branch",
            name: "Fast Branch",
            execute: async (ctx) => {
              await new Promise(resolve => setTimeout(resolve, 10));
              return { ...ctx, winner: "fast" };
            },
          },
          {
            id: "slow-branch",
            name: "Slow Branch", 
            execute: async (ctx) => {
              await new Promise(resolve => setTimeout(resolve, 100));
              return { ...ctx, winner: "slow" };
            },
          },
        ], "first")
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.winner).toBe("fast");
    });

    it("should execute parallel branches with 'race' merge strategy", async () => {
      const definition = defineWorkflow("parallel-race", "Parallel Race")
        .parallel("parallel1", "Parallel Race", [
          {
            id: "branch1",
            name: "Branch 1",
            execute: async (ctx) => {
              await new Promise(resolve => setTimeout(resolve, 10));
              return { ...ctx, result: "first" };
            },
          },
          {
            id: "branch2",
            name: "Branch 2",
            execute: async (ctx) => {
              await new Promise(resolve => setTimeout(resolve, 50));
              return { ...ctx, result: "second" };
            },
          },
        ], "race")
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.result).toBe("first");
    });
  });

  describe("Conditional steps", () => {
    it("should execute ifTrue step when condition is true", async () => {
      const definition = defineWorkflow("conditional-true", "Conditional True")
        .conditional("cond1", "Conditional Step", {
          condition: (ctx) => ctx.shouldExecute === true,
          ifTrue: {
            id: "true-step",
            name: "True Step",
            execute: async (ctx) => ({ ...ctx, executed: "ifTrue" }),
          },
          ifFalse: {
            id: "false-step", 
            name: "False Step",
            execute: async (ctx) => ({ ...ctx, executed: "ifFalse" }),
          },
        })
        .withInitialContext({ shouldExecute: true })
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.executed).toBe("ifTrue");
    });

    it("should execute ifFalse step when condition is false", async () => {
      const definition = defineWorkflow("conditional-false", "Conditional False")
        .conditional("cond1", "Conditional Step", {
          condition: (ctx) => ctx.shouldExecute === true,
          ifTrue: {
            id: "true-step",
            name: "True Step", 
            execute: async (ctx) => ({ ...ctx, executed: "ifTrue" }),
          },
          ifFalse: {
            id: "false-step",
            name: "False Step",
            execute: async (ctx) => ({ ...ctx, executed: "ifFalse" }),
          },
        })
        .withInitialContext({ shouldExecute: false })
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.executed).toBe("ifFalse");
    });

    it("should skip conditional step when condition is false and no ifFalse", async () => {
      const definition = defineWorkflow("conditional-skip", "Conditional Skip")
        .conditional("cond1", "Conditional Step", {
          condition: () => false,
          ifTrue: {
            id: "true-step",
            name: "True Step",
            execute: async (ctx) => ({ ...ctx, executed: "ifTrue" }),
          },
        })
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.executed).toBeUndefined();
    });
  });

  describe("Loop steps", () => {
    it("should execute loop until condition becomes false", async () => {
      const definition = defineWorkflow("loop-test", "Loop Test")
        .loop("loop1", "Counter Loop", {
          body: {
            id: "increment",
            name: "Increment",
            execute: async (ctx: any) => ({ ...ctx, counter: (ctx.counter || 0) + 1 }),
          },
          condition: (ctx: any) => (ctx.counter || 0) < 3,
        })
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.counter).toBe(3);
    });

    it("should respect maxIterations limit", async () => {
      const definition = defineWorkflow("loop-max", "Loop Max Iterations")
        .loop("loop1", "Infinite Loop", {
          body: {
            id: "increment",
            name: "Increment", 
            execute: async (ctx: any) => ({ ...ctx, counter: (ctx.counter || 0) + 1 }),
          },
          condition: () => true, // Always true
          maxIterations: 5,
        })
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.counter).toBe(5);
    });
  });

  describe("Retry with backoff", () => {
    it("should retry failed steps with exponential backoff", async () => {
      let attempts = 0;
      
      const definition = defineWorkflow("retry-test", "Retry Test")
        .step("flaky-step", "Flaky Step", async (ctx) => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return { ...ctx, attempts };
        })
        .withRetry({ maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 })
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.attempts).toBe(3);
      expect(attempts).toBe(3);
    });

    it("should fail after max retry attempts", async () => {
      const definition = defineWorkflow("retry-fail", "Retry Failure")
        .step("always-fail", "Always Fail", async () => {
          throw new Error("Always fails");
        })
        .withRetry({ maxAttempts: 2, backoffMs: 10 })
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Always fails");
      expect(result.failedStep).toBe("always-fail");
    });
  });

  describe("Rollback on failure", () => {
    it("should rollback completed steps when a step fails", async () => {
      const rollbackCalls: string[] = [];
      
      const definition: WorkflowDefinition = {
        id: "rollback-test",
        name: "Rollback Test",
        steps: [
          {
            id: "step1",
            name: "Step 1",
            execute: async (ctx) => ({ ...ctx, step1: "done" }),
            rollback: async () => {
              rollbackCalls.push("step1");
            },
          },
          {
            id: "step2",
            name: "Step 2", 
            execute: async (ctx) => ({ ...ctx, step2: "done" }),
            rollback: async () => {
              rollbackCalls.push("step2");
            },
          },
          {
            id: "step3",
            name: "Failing Step",
            execute: async () => {
              throw new Error("Step 3 failed");
            },
          },
        ],
      };

      const result = await engine.execute(definition);

      expect(result.status).toBe("failed");
      expect(result.failedStep).toBe("step3");
      expect(rollbackCalls).toEqual(["step2", "step1"]); // Reverse order
    });
  });

  describe("Timeout", () => {
    it("should timeout workflow when maxDurationMs is exceeded", async () => {
      const definition = defineWorkflow("timeout-test", "Timeout Test")
        .step("slow-step", "Slow Step", async (ctx) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { ...ctx, completed: true };
        })
        .step("second-step", "Second Step", async (ctx) => {
          await new Promise(resolve => setTimeout(resolve, 100)); 
          return { ...ctx, alsoCompleted: true };
        })
        .withTimeout(50) // 50ms timeout for 200ms of work
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("timeout");
    });
  });

  describe("Validation", () => {
    it("should validate workflow with duplicate step IDs", () => {
      const definition: WorkflowDefinition = {
        id: "invalid-workflow",
        name: "Invalid Workflow",
        steps: [
          {
            id: "duplicate",
            name: "Step 1",
            execute: async (ctx) => ctx,
          },
          {
            id: "duplicate", // Duplicate ID
            name: "Step 2",
            execute: async (ctx) => ctx,
          },
        ],
      };

      const validation = engine.validate(definition);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Duplicate step id: "duplicate"');
    });

    it("should validate workflow with empty steps array", () => {
      const definition: WorkflowDefinition = {
        id: "empty-workflow",
        name: "Empty Workflow",
        steps: [],
      };

      const validation = engine.validate(definition);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it("should validate valid workflow", () => {
      const definition = defineWorkflow("valid-workflow", "Valid Workflow")
        .step("step1", "Step 1", async (ctx) => ctx)
        .build();

      const validation = engine.validate(definition);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe("Builder DSL", () => {
    it("should build complex workflow using fluent API", async () => {
      const definition = defineWorkflow("complex-workflow", "Complex Workflow")
        .step("init", "Initialize", async (ctx) => ({ ...ctx, initialized: true }))
        .withInitialContext({ startTime: Date.now() })
        .parallel("parallel-work", "Parallel Work", [
          {
            id: "work1", 
            name: "Work 1",
            execute: async (ctx) => ({ ...ctx, work1: "done" }),
          },
          {
            id: "work2",
            name: "Work 2", 
            execute: async (ctx) => ({ ...ctx, work2: "done" }),
          },
        ])
        .conditional("final-check", "Final Check", {
          condition: (ctx) => ctx.work1 === "done" && ctx.work2 === "done",
          ifTrue: {
            id: "success",
            name: "Success",
            execute: async (ctx) => ({ ...ctx, result: "success" }),
          },
          ifFalse: {
            id: "failure",
            name: "Failure",
            execute: async (ctx) => ({ ...ctx, result: "failure" }),
          },
        })
        .withTimeout(5000)
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.initialized).toBe(true);
      expect(result.context.work1).toBe("done");
      expect(result.context.work2).toBe("done");
      expect(result.context.result).toBe("success");
      expect(result.context.startTime).toBeDefined();
    });
  });

  describe("Context isolation", () => {
    it("should use structuredClone for context isolation", async () => {
      const initialContext = { data: { nested: "value" } };
      
      const definition = defineWorkflow("isolation-test", "Isolation Test")
        .step("modify", "Modify Context", async (ctx: any) => {
          ctx.data.nested = "modified";
          ctx.data.new = "added";
          return ctx;
        })
        .withInitialContext(initialContext)
        .build();

      const result = await engine.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.data.nested).toBe("modified");
      expect(result.context.data.new).toBe("added");
      // Original context should be unchanged
      expect(initialContext.data.nested).toBe("value");
      expect(initialContext.data.new).toBeUndefined();
    });
  });

  describe("Agent step execution", () => {
    it("should execute agent steps with custom agentExecutor", async () => {
      const mockAgentExecutor = vi.fn().mockResolvedValue("agent response");
      const engineWithAgent = new DefaultWorkflowEngine({ agentExecutor: mockAgentExecutor });

      const definition = defineWorkflow("agent-test", "Agent Test")
        .agentStep("agent1", "Ask Agent", "What is 2+2?", "mathAnswer")
        .build();

      const result = await engineWithAgent.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.mathAnswer).toBe("agent response");
      expect(mockAgentExecutor).toHaveBeenCalledWith("What is 2+2?", {});
    });

    it("should execute agent steps with dynamic prompt", async () => {
      const mockAgentExecutor = vi.fn().mockResolvedValue("dynamic response");
      const engineWithAgent = new DefaultWorkflowEngine({ agentExecutor: mockAgentExecutor });

      const definition = defineWorkflow("dynamic-agent", "Dynamic Agent")
        .step("setup", "Setup", async (ctx) => ({ ...ctx, userName: "Alice" }))
        .agentStep("greet", "Greet User", (ctx: any) => `Hello ${ctx.userName}!`, "greeting")
        .build();

      const result = await engineWithAgent.execute(definition);

      expect(result.status).toBe("completed");
      expect(result.context.greeting).toBe("dynamic response");
      expect(mockAgentExecutor).toHaveBeenCalledWith("Hello Alice!", { userName: "Alice" });
    });
  });
});