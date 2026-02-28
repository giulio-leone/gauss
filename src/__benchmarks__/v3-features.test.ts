// =============================================================================
// Performance Benchmarks — Core v3.0 features
// =============================================================================

import { describe, it, expect } from "vitest";
import { Container } from "../adapters/di/container.js";
import { Lifetime } from "../ports/di.port.js";
import { SaveQueue } from "../adapters/save-queue/save-queue.js";
import { createTripWireMiddleware } from "../middleware/trip-wire.js";
import { createToolCallPatchingMiddleware } from "../middleware/tool-call-patching.js";
import { createPromptCachingMiddleware } from "../middleware/prompt-caching.js";
import { InMemoryBundler } from "../adapters/bundler/inmemory.adapter.js";
import { CompositeBackend, InMemoryKVBackend } from "../adapters/composite-backend/composite-backend.js";
import { createRecorderMiddleware, createReplayerMiddleware } from "../adapters/execution-replay/execution-replay.js";
import { AcpServer } from "../adapters/acp/acp-server.js";

// Helper to measure execution time
async function bench(fn: () => Promise<void> | void, iterations = 1000): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  return (performance.now() - start) / iterations;
}

describe("Performance Benchmarks", () => {
  // ─── DI Container ──────────────────────────────────────────────────

  describe("DI Container", () => {
    it("singleton resolution: < 0.01ms per resolve", async () => {
      const container = new Container();
      container.register("svc", () => ({ value: 42 }), Lifetime.SINGLETON);

      // Warmup
      container.resolve("svc");

      const avgMs = await bench(() => { container.resolve("svc"); }, 10000);
      expect(avgMs).toBeLessThan(0.01);
    });

    it("transient resolution: < 0.05ms per resolve", async () => {
      const container = new Container();
      container.register("svc", () => ({ value: Math.random() }), Lifetime.TRANSIENT);

      const avgMs = await bench(() => { container.resolve("svc"); }, 10000);
      expect(avgMs).toBeLessThan(0.05);
    });

    it("scoped resolution with child: < 0.05ms", async () => {
      const container = new Container();
      container.register("svc", () => ({ v: 1 }), Lifetime.SCOPED);
      const child = container.createScope();

      const avgMs = await bench(() => { child.resolve("svc"); }, 10000);
      expect(avgMs).toBeLessThan(0.05);
    });

    it("registers 1000 services in < 5ms", async () => {
      const start = performance.now();
      const container = new Container();
      for (let i = 0; i < 1000; i++) {
        container.register(`svc-${i}`, () => ({ id: i }), Lifetime.SINGLETON);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
    });
  });

  // ─── Save Queue ────────────────────────────────────────────────────

  describe("SaveQueue", () => {
    it("enqueue 10K entries in < 50ms", async () => {
      const queue = new SaveQueue({ maxSize: 100000 });
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        queue.enqueue("session-1", `key-${i}`, { data: i });
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it("flush 1K entries in < 20ms", async () => {
      const queue = new SaveQueue();
      for (let i = 0; i < 1000; i++) {
        queue.enqueue("s1", `k${i}`, i);
      }

      const start = performance.now();
      await queue.flush(async () => {});
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(20);
    });
  });

  // ─── Middleware ─────────────────────────────────────────────────────

  describe("Trip Wire Middleware", () => {
    it("beforeAgent check: < 0.01ms", async () => {
      const mw = createTripWireMiddleware({ maxTokens: 10000, maxTimeMs: 60000 });
      const ctx = { sessionId: "s", agentId: "a", modelId: "m", startedAt: Date.now(), state: {} };

      const avgMs = await bench(() => {
        mw.beforeAgent!(ctx, { prompt: "test" } as any);
      }, 10000);
      expect(avgMs).toBeLessThan(0.01);
    });
  });

  describe("Tool Call Patching Middleware", () => {
    it("patches 10K tool calls in < 50ms", async () => {
      const mw = createToolCallPatchingMiddleware({
        parseStringArgs: true,
        coerceTypes: true,
        stripNullArgs: true,
        aliasMap: { search_web: "web_search" },
      });
      const ctx = { sessionId: "s", agentId: "a", modelId: "m", startedAt: Date.now(), state: {} };

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        mw.beforeTool!(ctx, {
          toolName: "search_web",
          args: '{"query":"test","limit":"10","debug":null}',
          stepIndex: i,
        } as any);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe("Prompt Caching Middleware", () => {
    it("beforeAgent with 100 messages: < 1ms", async () => {
      const mw = createPromptCachingMiddleware({});
      const ctx = { sessionId: "s", agentId: "a", modelId: "claude-3", startedAt: Date.now(), state: {}, metadata: {} as Record<string, unknown> };
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: "user",
        content: `Message ${i}: ${"x".repeat(100)}`,
      }));

      const avgMs = await bench(() => {
        mw.beforeAgent!(ctx, { prompt: "test", messages } as any);
      }, 1000);
      expect(avgMs).toBeLessThan(1);
    });
  });

  // ─── Bundler ───────────────────────────────────────────────────────

  describe("InMemoryBundler", () => {
    it("bundles 100 files in < 10ms", async () => {
      const files: Record<string, string> = {};
      const entries = [];
      for (let i = 0; i < 100; i++) {
        files[`src/file${i}.ts`] = `export const x${i} = ${i}; // ${"padding".repeat(50)}`;
        entries.push({ entryPoint: `src/file${i}.ts`, outputPath: `dist/file${i}.js` });
      }
      const bundler = new InMemoryBundler(files);

      const start = performance.now();
      await bundler.bundle({ entries, minify: true });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });
  });

  // ─── Composite Backend ─────────────────────────────────────────────

  describe("CompositeBackend", () => {
    it("routes 10K operations in < 50ms", async () => {
      const backend = new CompositeBackend(new InMemoryKVBackend(), [
        { prefix: "cache/", backend: new InMemoryKVBackend() },
        { prefix: "blob/", backend: new InMemoryKVBackend() },
        { prefix: "session/", backend: new InMemoryKVBackend() },
      ]);

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        const prefix = ["cache/", "blob/", "session/", "other/"][i % 4];
        await backend.set(`${prefix}key-${i}`, { value: i });
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it("reads 10K keys in < 50ms", async () => {
      const backend = new CompositeBackend(new InMemoryKVBackend(), [
        { prefix: "data/", backend: new InMemoryKVBackend() },
      ]);

      for (let i = 0; i < 10000; i++) {
        await backend.set(`data/key-${i}`, i);
      }

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        await backend.get(`data/key-${i}`);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ─── Execution Replay ──────────────────────────────────────────────

  describe("Execution Replay", () => {
    it("records 10K events in < 10ms", async () => {
      const recorder = createRecorderMiddleware();
      const ctx = { sessionId: "s", agentId: "a", modelId: "m", startedAt: Date.now(), state: {} };

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        recorder.beforeTool!(ctx, { toolName: `tool-${i}`, args: { x: i }, stepIndex: i } as any);
        recorder.afterTool!(ctx, { toolName: `tool-${i}`, result: i * 2, durationMs: 1 } as any);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });

    it("replays 1K tool calls in < 5ms", async () => {
      const recorder = createRecorderMiddleware();
      const ctx = { sessionId: "s", agentId: "a", modelId: "m", startedAt: Date.now(), state: {} };

      for (let i = 0; i < 1000; i++) {
        recorder.beforeTool!(ctx, { toolName: "calc", args: { x: i }, stepIndex: i } as any);
        recorder.afterTool!(ctx, { toolName: "calc", result: i * 2, durationMs: 1 } as any);
      }

      const replayer = createReplayerMiddleware(recorder.getRecording());
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        replayer.beforeTool!(ctx, { toolName: "calc", args: { x: i }, stepIndex: i } as any);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
    });
  });

  // ─── ACP Server ────────────────────────────────────────────────────

  describe("ACP Server", () => {
    it("processes 1K JSON-RPC messages in < 20ms", async () => {
      const server = new AcpServer();
      await server.start();
      await server.processMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
      );

      server.registerHandler({
        async handle(method: string, params: unknown) {
          if (method === "echo") return params;
          return undefined;
        },
      });

      const msg = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "echo", params: { data: "test" } });

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        await server.processMessage(msg);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(20);

      await server.stop();
    });
  });
});
