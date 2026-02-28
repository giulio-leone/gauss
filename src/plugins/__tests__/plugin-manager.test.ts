import { describe, expect, it, vi } from "vitest";
import type { Tool } from "../../core/llm/index.js";

import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import type { PluginContext, PluginSetupContext } from "../../ports/plugin.port.js";
import { PluginManager } from "../plugin-manager.js";

function createContexts(toolNames: string[] = ["ls"]): {
  setupCtx: PluginSetupContext;
  runCtx: PluginContext;
  unsubscribeSpy: ReturnType<typeof vi.fn>;
} {
  const unsubscribeSpy = vi.fn();

  const setupCtx: PluginSetupContext = {
    sessionId: "session-test",
    agentName: "TestAgent",
    config: {
      instructions: "Test instructions",
      maxSteps: 10,
    },
    filesystem: new VirtualFilesystem(),
    memory: new InMemoryAdapter(),
    toolNames,
    on: () => unsubscribeSpy,
  };

  const runCtx: PluginContext = {
    sessionId: setupCtx.sessionId,
    agentName: setupCtx.agentName,
    config: setupCtx.config,
    filesystem: setupCtx.filesystem,
    memory: setupCtx.memory,
    toolNames: setupCtx.toolNames,
    runMetadata: { correlationId: "corr-1" },
  };

  return { setupCtx, runCtx, unsubscribeSpy };
}

describe("PluginManager", () => {
  it("registers plugins and executes beforeRun hooks in deterministic order", async () => {
    const manager = new PluginManager();
    const order: string[] = [];
    const { runCtx } = createContexts();

    manager.register({
      name: "first",
      hooks: {
        beforeRun: async (_ctx, params) => {
          order.push("first");
          return { prompt: `${params.prompt} [first]` };
        },
      },
    });

    manager.register({
      name: "second",
      hooks: {
        beforeRun: async (_ctx, params) => {
          order.push("second");
          return { prompt: `${params.prompt} [second]` };
        },
      },
    });

    const result = await manager.runBeforeRun(runCtx, { prompt: "hello" });

    expect(order).toEqual(["first", "second"]);
    expect(result.prompt).toBe("hello [first] [second]");
  });

  it("collects plugin tools and rejects duplicate tool names", () => {
    const manager = new PluginManager();
    const fakeTool = {
      description: "fake",
      execute: vi.fn(async () => "ok"),
    } as unknown as Tool;

    manager.register({ name: "plugin-a", tools: { "tool:a": fakeTool } });
    manager.register({ name: "plugin-b", tools: { "tool:b": fakeTool } });

    expect(manager.collectTools()).toHaveProperty("tool:a");
    expect(manager.collectTools()).toHaveProperty("tool:b");

    const duplicateManager = new PluginManager();
    duplicateManager.register({ name: "plugin-a", tools: { duplicate: fakeTool } });
    duplicateManager.register({ name: "plugin-b", tools: { duplicate: fakeTool } });

    expect(() => duplicateManager.collectTools()).toThrow(/Duplicate plugin tool/);
  });

  it("initializes once and disposes plugins in reverse order", async () => {
    const manager = new PluginManager();
    const calls: string[] = [];
    const { setupCtx } = createContexts();

    manager.register({
      name: "one",
      setup: () => {
        calls.push("setup:one");
      },
      dispose: () => {
        calls.push("dispose:one");
      },
    });

    manager.register({
      name: "two",
      setup: () => {
        calls.push("setup:two");
      },
      dispose: () => {
        calls.push("dispose:two");
      },
    });

    await manager.initialize(setupCtx);
    await manager.initialize(setupCtx);
    await manager.dispose();

    expect(calls).toEqual([
      "setup:one",
      "setup:two",
      "dispose:two",
      "dispose:one",
    ]);
  });

  it("tracks setup subscriptions and unsubscribes on dispose", async () => {
    const manager = new PluginManager();
    const { setupCtx, unsubscribeSpy } = createContexts();

    manager.register({
      name: "subscribed-plugin",
      setup: (ctx) => {
        ctx.on("agent:start", () => {
          // no-op
        });
      },
    });

    await manager.initialize(setupCtx);
    await manager.dispose();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
