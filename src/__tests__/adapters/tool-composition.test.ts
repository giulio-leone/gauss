import { describe, it, expect, vi } from "vitest";
import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

import { DefaultToolCompositionAdapter } from "../../adapters/tool-composition/default-tool-composition.adapter.js";
import type { ToolMiddleware } from "../../ports/tool-composition.port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(
  description: string,
  fn: (args: any) => Promise<unknown>,
  schema: z.ZodType = z.object({}).passthrough(),
): Tool {
  return tool({ description, inputSchema: schema as any, execute: fn }) as unknown as Tool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DefaultToolCompositionAdapter", () => {
  const adapter = new DefaultToolCompositionAdapter();

  // ─── pipe ────────────────────────────────────────────────────────────

  describe("pipe", () => {
    it("should chain two tools so output of first feeds into second", async () => {
      const double = makeTool("double", async (a: any) => ({ value: (a.value as number) * 2 }), z.object({ value: z.number() }));
      const addOne = makeTool("add one", async (a: any) => ({ value: (a.value as number) + 1 }), z.object({ value: z.number() }));

      const composed = adapter.createPipeline({ double, addOne }).pipe(["double", "addOne"]).build();

      const pipeTool = composed["double_pipe_addOne"];
      expect(pipeTool).toBeDefined();

      const result = await pipeTool.execute!({ value: 5 } as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toEqual({ value: 11 }); // (5*2)+1
    });

    it("should chain three tools in sequence", async () => {
      const a = makeTool("a", async (x: any) => ({ v: x.v + "A" }), z.object({ v: z.string() }));
      const b = makeTool("b", async (x: any) => ({ v: x.v + "B" }), z.object({ v: z.string() }));
      const c = makeTool("c", async (x: any) => ({ v: x.v + "C" }), z.object({ v: z.string() }));

      const composed = adapter.createPipeline({ a, b, c }).pipe(["a", "b", "c"]).build();
      const result = await composed["a_pipe_b_pipe_c"].execute!({ v: "" } as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toEqual({ v: "ABC" });
    });

    it("should throw when a piped tool is missing", () => {
      const a = makeTool("a", async () => ({}));

      expect(() =>
        adapter.createPipeline({ a }).pipe(["a", "missing"]).build(),
      ).toThrow('Tool "missing" not found');
    });

    it("should preserve original tools alongside pipe tools", async () => {
      const a = makeTool("a", async () => "A");
      const b = makeTool("b", async () => "B");

      const composed = adapter.createPipeline({ a, b }).pipe(["a", "b"]).build();

      expect(composed["a"]).toBeDefined();
      expect(composed["b"]).toBeDefined();
      expect(composed["a_pipe_b"]).toBeDefined();
    });

    it("should skip pipe with fewer than 2 tools", async () => {
      const a = makeTool("a", async () => "ok");
      const composed = adapter.createPipeline({ a }).pipe(["a"]).build();

      // Only the original tool, no pipe created
      expect(Object.keys(composed)).toEqual(["a"]);
    });
  });

  // ─── fallback ────────────────────────────────────────────────────────

  describe("withFallback", () => {
    it("should use primary when it succeeds", async () => {
      const primary = makeTool("primary", async () => "primary-ok");
      const fallback = makeTool("fallback", async () => "fallback-ok");

      const composed = adapter.createPipeline({ primary, fallback }).withFallback("primary", "fallback").build();
      const result = await composed["primary"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toBe("primary-ok");
    });

    it("should fall back when primary throws", async () => {
      const primary = makeTool("primary", async () => { throw new Error("boom"); });
      const fallback = makeTool("fallback", async () => "fallback-ok");

      const composed = adapter.createPipeline({ primary, fallback }).withFallback("primary", "fallback").build();
      const result = await composed["primary"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toBe("fallback-ok");
    });

    it("should propagate error when both primary and fallback throw", async () => {
      const primary = makeTool("primary", async () => { throw new Error("boom1"); });
      const fallback = makeTool("fallback", async () => { throw new Error("boom2"); });

      const composed = adapter.createPipeline({ primary, fallback }).withFallback("primary", "fallback").build();
      await expect(
        composed["primary"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any }),
      ).rejects.toThrow("boom2");
    });
  });

  // ─── middleware ──────────────────────────────────────────────────────

  describe("withMiddleware", () => {
    it("should run before hook to transform args", async () => {
      const greet = makeTool("greet", async (a: any) => `Hello ${a.name}`, z.object({ name: z.string() }));

      const mw: ToolMiddleware = {
        name: "upper",
        before: async (_name, args) => ({ ...(args as any), name: ((args as any).name as string).toUpperCase() }),
      };

      const composed = adapter.createPipeline({ greet }).withMiddleware(mw).build();
      const result = await composed["greet"].execute!({ name: "world" } as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toBe("Hello WORLD");
    });

    it("should run after hook to transform result", async () => {
      const num = makeTool("num", async () => 42);

      const mw: ToolMiddleware = {
        name: "double-result",
        after: async (_name, result) => (result as number) * 2,
      };

      const composed = adapter.createPipeline({ num }).withMiddleware(mw).build();
      const result = await composed["num"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toBe(84);
    });

    it("should chain multiple middlewares in order for before", async () => {
      const echo = makeTool("echo", async (a: any) => a.v, z.object({ v: z.string() }));

      const mw1: ToolMiddleware = { name: "append-1", before: async (_n, a) => ({ ...(a as any), v: (a as any).v + "1" }) };
      const mw2: ToolMiddleware = { name: "append-2", before: async (_n, a) => ({ ...(a as any), v: (a as any).v + "2" }) };

      const composed = adapter.createPipeline({ echo }).withMiddleware(mw1).withMiddleware(mw2).build();
      const result = await composed["echo"].execute!({ v: "X" } as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toBe("X12");
    });

    it("should chain multiple middlewares in order for after", async () => {
      const num = makeTool("num", async () => 1);

      const mw1: ToolMiddleware = { name: "add10", after: async (_n, r) => (r as number) + 10 };
      const mw2: ToolMiddleware = { name: "mul3", after: async (_n, r) => (r as number) * 3 };

      const composed = adapter.createPipeline({ num }).withMiddleware(mw1).withMiddleware(mw2).build();
      const result = await composed["num"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      // (1 + 10) * 3 = 33
      expect(result).toBe(33);
    });

    it("should apply middleware to all tools", async () => {
      const a = makeTool("a", async () => "a");
      const b = makeTool("b", async () => "b");

      const calls: string[] = [];
      const mw: ToolMiddleware = {
        name: "logger",
        before: async (toolName) => { calls.push(toolName); return {}; },
      };

      const composed = adapter.createPipeline({ a, b }).withMiddleware(mw).build();

      await composed["a"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      await composed["b"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });

      expect(calls).toEqual(["a", "b"]);
    });
  });

  // ─── onError ─────────────────────────────────────────────────────────

  describe("onError middleware", () => {
    it("should catch error and return fallback value", async () => {
      const failing = makeTool("failing", async () => { throw new Error("fail"); });

      const mw: ToolMiddleware = {
        name: "error-handler",
        onError: async (_name, _err) => "recovered",
      };

      const composed = adapter.createPipeline({ failing }).withMiddleware(mw).build();
      const result = await composed["failing"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toBe("recovered");
    });

    it("should rethrow when onError returns null", async () => {
      const failing = makeTool("failing", async () => { throw new Error("unrecoverable"); });

      const mw: ToolMiddleware = {
        name: "passthrough",
        onError: async () => null,
      };

      const composed = adapter.createPipeline({ failing }).withMiddleware(mw).build();
      await expect(
        composed["failing"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any }),
      ).rejects.toThrow("unrecoverable");
    });

    it("should rethrow when onError returns undefined", async () => {
      const failing = makeTool("failing", async () => { throw new Error("swallowed"); });

      const mw: ToolMiddleware = {
        name: "returns-undefined",
        onError: async () => undefined as any,
      };

      const composed = adapter.createPipeline({ failing }).withMiddleware(mw).build();
      await expect(
        composed["failing"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any }),
      ).rejects.toThrow("swallowed");
    });

    it("should pass error details to onError", async () => {
      const failing = makeTool("failing", async () => { throw new Error("detail-err"); });

      const spy = vi.fn().mockResolvedValue("fixed");
      const mw: ToolMiddleware = { name: "spy", onError: spy };

      const composed = adapter.createPipeline({ failing }).withMiddleware(mw).build();
      await composed["failing"].execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });

      expect(spy).toHaveBeenCalledWith("failing", expect.objectContaining({ message: "detail-err" }));
    });
  });

  // ─── complex combinations ───────────────────────────────────────────

  describe("complex composition", () => {
    it("should combine pipe + fallback", async () => {
      const double = makeTool("double", async (a: any) => ({ value: (a.value as number) * 2 }), z.object({ value: z.number() }));
      const failAdd = makeTool("failAdd", async () => { throw new Error("oops"); }, z.object({ value: z.number() }));
      const safeAdd = makeTool("safeAdd", async (a: any) => ({ value: (a.value as number) + 100 }), z.object({ value: z.number() }));

      const composed = adapter
        .createPipeline({ double, failAdd, safeAdd })
        .withFallback("failAdd", "safeAdd")
        .pipe(["double", "failAdd"])
        .build();

      const result = await composed["double_pipe_failAdd"].execute!(
        { value: 3 } as any,
        { toolCallId: "", messages: [], abortSignal: undefined as any },
      );
      // double(3)=6 → failAdd falls back to safeAdd(6)=106
      expect(result).toEqual({ value: 106 });
    });

    it("should combine pipe + middleware", async () => {
      const a = makeTool("a", async (x: any) => ({ v: x.v * 2 }), z.object({ v: z.number() }));
      const b = makeTool("b", async (x: any) => ({ v: x.v + 1 }), z.object({ v: z.number() }));

      const mw: ToolMiddleware = {
        name: "add-tag",
        after: async (_name, result) => ({ ...(result as any), tagged: true }),
      };

      const composed = adapter.createPipeline({ a, b }).pipe(["a", "b"]).withMiddleware(mw).build();
      const result = await composed["a_pipe_b"].execute!(
        { v: 5 } as any,
        { toolCallId: "", messages: [], abortSignal: undefined as any },
      );
      // pipe: a(5)→{v:10}, b({v:10})→{v:11}; middleware adds tagged
      expect(result).toEqual({ v: 11, tagged: true });
    });

    it("should fire counting middleware only once for a pipe call, not N+1 times", async () => {
      const a = makeTool("a", async (x: any) => ({ v: x.v + "A" }), z.object({ v: z.string() }));
      const b = makeTool("b", async (x: any) => ({ v: x.v + "B" }), z.object({ v: z.string() }));
      const c = makeTool("c", async (x: any) => ({ v: x.v + "C" }), z.object({ v: z.string() }));

      let count = 0;
      const countingMw: ToolMiddleware = {
        name: "counter",
        before: async (_name, args) => { count++; return args; },
      };

      const composed = adapter
        .createPipeline({ a, b, c })
        .pipe(["a", "b", "c"])
        .withMiddleware(countingMw)
        .build();

      await composed["a_pipe_b_pipe_c"].execute!(
        { v: "" } as any,
        { toolCallId: "", messages: [], abortSignal: undefined as any },
      );

      // Middleware fires once for the pipe tool, not 1 + 3 times
      expect(count).toBe(1);
    });

    it("should combine fallback + middleware with onError", async () => {
      const primary = makeTool("primary", async () => { throw new Error("primary-err"); });
      const fallback = makeTool("fallback", async () => { throw new Error("fallback-err"); });

      const mw: ToolMiddleware = {
        name: "catch-all",
        onError: async (_name, _err) => "middleware-saved",
      };

      const composed = adapter
        .createPipeline({ primary, fallback })
        .withFallback("primary", "fallback")
        .withMiddleware(mw)
        .build();

      // Both primary and fallback fail, but middleware catches
      const result = await composed["primary"].execute!(
        {} as any,
        { toolCallId: "", messages: [], abortSignal: undefined as any },
      );
      expect(result).toBe("middleware-saved");
    });
  });

  // ─── immutability ────────────────────────────────────────────────────

  describe("immutability", () => {
    it("should return new pipeline instances (fluent immutable)", () => {
      const a = makeTool("a", async () => "a");
      const b = makeTool("b", async () => "b");

      const p1 = adapter.createPipeline({ a, b });
      const p2 = p1.pipe(["a", "b"]);
      const p3 = p1.withMiddleware({ name: "noop" });

      expect(p1).not.toBe(p2);
      expect(p1).not.toBe(p3);
      expect(p2).not.toBe(p3);
    });

    it("should not mutate original tools record", async () => {
      const a = makeTool("a", async () => "original");
      const tools = { a };

      adapter.createPipeline(tools).withMiddleware({
        name: "change",
        after: async () => "changed",
      }).build();

      const result = await tools.a.execute!({} as any, { toolCallId: "", messages: [], abortSignal: undefined as any });
      expect(result).toBe("original");
    });
  });
});
