// =============================================================================
// PluginManager — Manages plugin lifecycle, tools, and hook execution order
// =============================================================================

import type { Tool } from "ai";

import type {
  AfterRunParams,
  AfterStepParams,
  AfterToolParams,
  BeforeRunParams,
  BeforeRunResult,
  BeforeStepParams,
  BeforeStepResult,
  BeforeToolParams,
  BeforeToolResult,
  DeepAgentPlugin,
  OnErrorParams,
  OnErrorResult,
  PluginContext,
  PluginSetupContext,
} from "../ports/plugin.port.js";

export class PluginManager {
  private readonly plugins: DeepAgentPlugin[] = [];
  private readonly subscriptions = new Map<DeepAgentPlugin, Set<() => void>>();
  private initPromise?: Promise<void>;
  private disposed = false;

  register(plugin: DeepAgentPlugin): void {
    if (this.initPromise) throw new Error("Cannot register plugins after initialization");
    if (this.plugins.some((p) => p.name === plugin.name)) {
      throw new Error(`Plugin \"${plugin.name}\" is already registered`);
    }
    this.plugins.push(plugin);
  }

  async initialize(ctx: PluginSetupContext): Promise<void> {
    if (this.disposed) throw new Error("Cannot initialize a disposed PluginManager");
    if (!this.initPromise) {
      this.initPromise = this.doInitialize(ctx);
    }
    return this.initPromise;
  }

  private async doInitialize(ctx: PluginSetupContext): Promise<void> {
    const initialized: DeepAgentPlugin[] = [];

    try {
      for (const plugin of this.plugins) {
        const pluginCtx: PluginSetupContext = {
          ...ctx,
          on: (eventType, handler) => {
            const unsubscribe = ctx.on(eventType, handler);
            let unsubscribers = this.subscriptions.get(plugin);
            if (!unsubscribers) {
              unsubscribers = new Set();
              this.subscriptions.set(plugin, unsubscribers);
            }

            const trackedUnsubscribe = (): void => {
              unsubscribe();
              unsubscribers?.delete(trackedUnsubscribe);
            };

            unsubscribers.add(trackedUnsubscribe);
            return trackedUnsubscribe;
          },
        };

        if (plugin.setup) {
          await plugin.setup(pluginCtx);
        }

        initialized.push(plugin);
      }
    } catch (error) {
      await this.rollback(initialized);
      this.initPromise = undefined;
      throw error;
    }
  }

  private async rollback(initialized: DeepAgentPlugin[]): Promise<void> {
    for (let i = initialized.length - 1; i >= 0; i--) {
      const plugin = initialized[i]!;
      this.detachAllSubscriptions(plugin);
      if (!plugin.dispose) continue;
      try {
        await plugin.dispose();
      } catch {
        // Best-effort rollback
      }
    }
  }

  private detachAllSubscriptions(plugin: DeepAgentPlugin): void {
    const unsubscribers = this.subscriptions.get(plugin);
    if (!unsubscribers) return;
    for (const unsubscribe of unsubscribers) {
      try {
        unsubscribe();
      } catch {
        // Best-effort cleanup
      }
    }
    this.subscriptions.delete(plugin);
  }

  /** Collect all plugin tools with deterministic override protection. */
  collectTools(): Record<string, Tool> {
    const tools: Record<string, Tool> = {};

    for (const plugin of this.plugins) {
      if (!plugin.tools) continue;

      for (const [toolName, toolDef] of Object.entries(plugin.tools)) {
        if (toolName in tools) {
          throw new Error(`Duplicate plugin tool \"${toolName}\" from plugin \"${plugin.name}\"`);
        }
        tools[toolName] = toolDef;
      }
    }

    return tools;
  }

  async runBeforeRun(ctx: PluginContext, params: BeforeRunParams): Promise<BeforeRunResult> {
    let prompt = params.prompt;

    for (const plugin of this.plugins) {
      const hook = plugin.hooks?.beforeRun;
      if (!hook) continue;

      const result = await hook(ctx, { prompt });
      if (result?.prompt !== undefined) {
        prompt = result.prompt;
      }
    }

    return { prompt };
  }

  async runAfterRun(ctx: PluginContext, params: AfterRunParams): Promise<void> {
    for (const plugin of this.plugins) {
      const hook = plugin.hooks?.afterRun;
      if (!hook) continue;
      await hook(ctx, params);
    }
  }

  async runBeforeTool(ctx: PluginContext, params: BeforeToolParams): Promise<BeforeToolResult> {
    let args = params.args;

    for (const plugin of this.plugins) {
      const hook = plugin.hooks?.beforeTool;
      if (!hook) continue;

      const result = await hook(ctx, {
        toolName: params.toolName,
        args,
      });

      if (result?.args !== undefined) {
        args = result.args;
      }

      if (result?.skip) {
        return {
          args,
          skip: true,
          result: result.result,
        };
      }
    }

    return { args };
  }

  async runAfterTool(ctx: PluginContext, params: AfterToolParams): Promise<void> {
    for (const plugin of this.plugins) {
      const hook = plugin.hooks?.afterTool;
      if (!hook) continue;
      await hook(ctx, params);
    }
  }

  async runBeforeStep(ctx: PluginContext, params: BeforeStepParams): Promise<BeforeStepResult> {
    let step = params.step;

    for (const plugin of this.plugins) {
      const hook = plugin.hooks?.beforeStep;
      if (!hook) continue;

      const result = await hook(ctx, {
        stepIndex: params.stepIndex,
        step,
      });

      if (result?.step !== undefined) {
        step = result.step;
      }

      if (result?.skip) {
        return {
          step,
          skip: true,
        };
      }
    }

    return { step };
  }

  async runAfterStep(ctx: PluginContext, params: AfterStepParams): Promise<void> {
    for (const plugin of this.plugins) {
      const hook = plugin.hooks?.afterStep;
      if (!hook) continue;
      await hook(ctx, params);
    }
  }

  async runOnError(ctx: PluginContext, params: OnErrorParams): Promise<OnErrorResult> {
    let suppress = false;

    for (const plugin of this.plugins) {
      const hook = plugin.hooks?.onError;
      if (!hook) continue;

      try {
        const result = await hook(ctx, params);
        if (result?.suppress) suppress = true;
      } catch {
        // onError must be best-effort and never mask original failures
      }
    }

    return { suppress };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    const errors: unknown[] = [];

    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]!;
      this.detachAllSubscriptions(plugin);

      if (!plugin.dispose) continue;

      try {
        await plugin.dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "Plugin disposal errors");
    }
  }

  get count(): number {
    return this.plugins.length;
  }

  getPlugins(): readonly DeepAgentPlugin[] {
    return this.plugins;
  }
}
