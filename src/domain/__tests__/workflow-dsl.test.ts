import { describe, it, expect } from "vitest";
import { workflow, WorkflowDSL } from "../../domain/workflow-dsl.js";
import { z } from "zod";

describe("WorkflowDSL", () => {
  it("workflow() returns a WorkflowDSL", () => {
    expect(workflow("test")).toBeInstanceOf(WorkflowDSL);
  });

  it("builds a sequential workflow with .then()", () => {
    const wf = workflow("seq")
      .name("Sequential Flow")
      .then({
        id: "step1",
        execute: async (ctx) => ({ ...ctx, step1: true }),
      })
      .then({
        id: "step2",
        execute: async (ctx) => ({ ...ctx, step2: true }),
      })
      .build();

    expect(wf.id).toBe("seq");
    expect(wf.name).toBe("Sequential Flow");
    expect(wf.steps).toHaveLength(2);
    expect(wf.steps[0].id).toBe("step1");
    expect(wf.steps[1].id).toBe("step2");
  });

  it("step execute works correctly", async () => {
    const wf = workflow("exec")
      .then({
        id: "add",
        execute: async (ctx) => ({ ...ctx, sum: (ctx.a as number) + (ctx.b as number) }),
      })
      .build();

    const result = await wf.steps[0].execute({ a: 2, b: 3 });
    expect(result.sum).toBe(5);
  });

  it("branch step routes based on condition", async () => {
    const wf = workflow("branch")
      .branch(
        (ctx) => (ctx.value as number) > 10,
        { id: "high", execute: async (ctx) => ({ ...ctx, path: "high" }) },
        { id: "low", execute: async (ctx) => ({ ...ctx, path: "low" }) }
      )
      .build();

    expect(wf.steps).toHaveLength(1);
    expect(wf.steps[0].id).toBe("branch-0");

    const highResult = await wf.steps[0].execute({ value: 20 });
    expect(highResult.path).toBe("high");

    const lowResult = await wf.steps[0].execute({ value: 5 });
    expect(lowResult.path).toBe("low");
  });

  it("branch with array of steps", async () => {
    const wf = workflow("multi-branch")
      .branch(
        (ctx) => ctx.go === true,
        [
          { id: "s1", execute: async (ctx) => ({ ...ctx, s1: true }) },
          { id: "s2", execute: async (ctx) => ({ ...ctx, s2: true }) },
        ]
      )
      .build();

    const result = await wf.steps[0].execute({ go: true });
    expect(result.s1).toBe(true);
    expect(result.s2).toBe(true);
  });

  it("parallel step executes all concurrently and merges", async () => {
    const wf = workflow("par")
      .parallel(
        { id: "a", execute: async (ctx) => ({ ...ctx, a: 1 }) },
        { id: "b", execute: async (ctx) => ({ ...ctx, b: 2 }) },
        { id: "c", execute: async (ctx) => ({ ...ctx, c: 3 }) }
      )
      .build();

    expect(wf.steps).toHaveLength(1);
    expect(wf.steps[0].id).toBe("parallel-0");
    expect(wf.steps[0].type).toBe("parallel");

    const result = await wf.steps[0].execute({});
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("validates input schema with Zod", async () => {
    const wf = workflow("validated")
      .then({
        id: "checked",
        inputSchema: z.object({ name: z.string() }),
        execute: async (ctx) => ctx,
      })
      .build();

    await expect(wf.steps[0].execute({ name: "valid" })).resolves.toBeDefined();
    await expect(wf.steps[0].execute({ name: 123 })).rejects.toThrow();
  });

  it("validates output schema with Zod", async () => {
    const wf = workflow("out-validated")
      .then({
        id: "produces",
        outputSchema: z.object({ result: z.number() }),
        execute: async () => ({ result: "not-a-number" }),
      })
      .build();

    await expect(wf.steps[0].execute({})).rejects.toThrow();
  });

  it("complex workflow: then + branch + parallel + then", async () => {
    const wf = workflow("complex")
      .then({
        id: "init",
        execute: async (ctx) => ({ ...ctx, initialized: true }),
      })
      .branch(
        (ctx) => ctx.initialized === true,
        { id: "expand", execute: async (ctx) => ({ ...ctx, expanded: true }) }
      )
      .parallel(
        { id: "fetch-a", execute: async (ctx) => ({ ...ctx, dataA: "a" }) },
        { id: "fetch-b", execute: async (ctx) => ({ ...ctx, dataB: "b" }) }
      )
      .then({
        id: "finalize",
        execute: async (ctx) => ({ ...ctx, done: true }),
      })
      .build();

    expect(wf.steps).toHaveLength(4);
    expect(wf.steps[0].id).toBe("init");
    expect(wf.steps[1].id).toBe("branch-1");
    expect(wf.steps[2].id).toBe("parallel-2");
    expect(wf.steps[3].id).toBe("finalize");
  });
});
