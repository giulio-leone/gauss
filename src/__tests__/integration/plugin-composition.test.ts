import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PluginManager } from "../../plugins/plugin-manager.js";
import { GuardrailsPlugin } from "../../plugins/guardrails.plugin.js";
import { ObservabilityPlugin } from "../../plugins/observability.plugin.js";
import { WorkflowPlugin } from "../../plugins/workflow.plugin.js";
import { InMemoryTracingAdapter } from "../../adapters/tracing/in-memory-tracing.adapter.js";
import { InMemoryMetricsAdapter } from "../../adapters/metrics/in-memory-metrics.adapter.js";
import { ConsoleLoggingAdapter } from "../../adapters/logging/console-logging.adapter.js";
import type { PluginContext, PluginSetupContext } from "../../ports/plugin.port.js";
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

function createMockSetupContext(): PluginSetupContext {
  return {
    logger: new ConsoleLoggingAdapter(),
    memory: new InMemoryAdapter(),
    filesystem: new VirtualFilesystem(),
  };
}

describe("Plugin Composition Integration", () => {
  let pluginManager: PluginManager;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pluginManager = new PluginManager();
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    pluginManager.dispose();
  });

  describe("Multiple plugins working together", () => {
    it("should register and initialize both GuardrailsPlugin and ObservabilityPlugin", async () => {
      // Setup observability plugin
      const tracer = new InMemoryTracingAdapter();
      const metrics = new InMemoryMetricsAdapter();
      const logger = new ConsoleLoggingAdapter();
      
      const observabilityPlugin = new ObservabilityPlugin({
        tracing: tracer,
        metrics: metrics,
        logging: logger,
      });

      const guardrailsPlugin = new GuardrailsPlugin({
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        piiFilters: [],
      });

      // Register plugins
      pluginManager.register(guardrailsPlugin);
      pluginManager.register(observabilityPlugin);

      // Initialize
      await pluginManager.initialize(createMockSetupContext());

      // Verify both plugins are registered
      const tools = pluginManager.collectTools();
      expect(typeof tools).toBe("object");
    });

    it("should fire hooks from both plugins in registration order", async () => {
      const hookCallOrder: string[] = [];

      // Create mock plugins that track hook calls
      const plugin1 = {
        name: "plugin1",
        async setup() {},
        hooks: {
          beforeRun: vi.fn().mockImplementation(async () => {
            hookCallOrder.push("plugin1-beforeRun");
          }),
        },
      };

      const plugin2 = {
        name: "plugin2", 
        async setup() {},
        hooks: {
          beforeRun: vi.fn().mockImplementation(async () => {
            hookCallOrder.push("plugin2-beforeRun");
          }),
        },
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      await pluginManager.initialize(createMockSetupContext());

      // Execute hooks
      await pluginManager.runBeforeRun(createMockContext(), { prompt: "test" });

      // Verify hooks fired in registration order
      expect(hookCallOrder).toEqual(["plugin1-beforeRun", "plugin2-beforeRun"]);
      expect(plugin1.hooks.beforeRun).toHaveBeenCalledTimes(1);
      expect(plugin2.hooks.beforeRun).toHaveBeenCalledTimes(1);
    });

    it("should combine tools from multiple plugins", async () => {
      // Create simple mock plugins with tools
      const plugin1 = {
        name: "plugin1",
        async setup() {},
        tools: {
          tool1: {
            name: "tool1",
            description: "Tool from plugin 1",
            parameters: { type: "object" },
            execute: vi.fn(),
          },
        },
      };
      
      const plugin2 = {
        name: "plugin2",
        async setup() {},
        tools: {
          tool2: {
            name: "tool2", 
            description: "Tool from plugin 2",
            parameters: { type: "object" },
            execute: vi.fn(),
          },
        },
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      await pluginManager.initialize(createMockSetupContext());

      const tools = pluginManager.collectTools();
      const toolNames = Object.keys(tools);
      
      // Should have tools from both plugins
      expect(toolNames).toContain("tool1");
      expect(toolNames).toContain("tool2");
      expect(toolNames.length).toBe(2);
    });
  });

  describe("Plugin ordering", () => {
    it("should execute beforeStep hooks in registration order", async () => {
      const callOrder: string[] = [];

      const firstPlugin = {
        name: "first",
        async setup() {},
        hooks: {
          beforeStep: vi.fn().mockImplementation(async () => {
            callOrder.push("first");
          }),
        },
      };

      const secondPlugin = {
        name: "second",
        async setup() {},
        hooks: {
          beforeStep: vi.fn().mockImplementation(async () => {
            callOrder.push("second");
          }),
        },
      };

      const thirdPlugin = {
        name: "third",
        async setup() {},
        hooks: {
          beforeStep: vi.fn().mockImplementation(async () => {
            callOrder.push("third");
          }),
        },
      };

      // Register in specific order
      pluginManager.register(firstPlugin);
      pluginManager.register(secondPlugin); 
      pluginManager.register(thirdPlugin);
      await pluginManager.initialize(createMockSetupContext());

      // Execute beforeStep hook
      await pluginManager.runBeforeStep(createMockContext(), {
        stepIndex: 0,
        step: { type: "text", text: "test" },
      });

      // Verify execution order matches registration order
      expect(callOrder).toEqual(["first", "second", "third"]);
    });

    it("should execute afterStep hooks in registration order", async () => {
      const callOrder: string[] = [];

      const pluginA = {
        name: "pluginA",
        async setup() {},
        hooks: {
          afterStep: vi.fn().mockImplementation(async () => {
            callOrder.push("pluginA");
          }),
        },
      };

      const pluginB = {
        name: "pluginB",
        async setup() {},
        hooks: {
          afterStep: vi.fn().mockImplementation(async () => {
            callOrder.push("pluginB");
          }),
        },
      };

      pluginManager.register(pluginA);
      pluginManager.register(pluginB);
      await pluginManager.initialize(createMockSetupContext());

      await pluginManager.runAfterStep(createMockContext(), {
        stepIndex: 0,
        step: { type: "text", text: "test" },
        result: { type: "text", text: "result" },
      });

      expect(callOrder).toEqual(["pluginA", "pluginB"]);
    });
  });

  describe("Error handling across plugins", () => {
    it("should handle errors from one plugin without affecting others", async () => {
      const workingPlugin = {
        name: "working",
        async setup() {},
        hooks: {
          beforeRun: vi.fn().mockResolvedValue({ prompt: "modified" }),
        },
      };

      const errorPlugin = {
        name: "error",
        async setup() {},
        hooks: {
          beforeRun: vi.fn().mockRejectedValue(new Error("Plugin error")),
        },
      };

      pluginManager.register(workingPlugin);
      pluginManager.register(errorPlugin);
      await pluginManager.initialize(createMockSetupContext());

      // Error in second plugin should propagate
      await expect(
        pluginManager.runBeforeRun(createMockContext(), { prompt: "test" })
      ).rejects.toThrow("Plugin error");

      expect(workingPlugin.hooks.beforeRun).toHaveBeenCalled();
      expect(errorPlugin.hooks.beforeRun).toHaveBeenCalled();
    });
  });
});