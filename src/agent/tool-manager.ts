// =============================================================================
// ToolManager — Tool catalog building, wrapping, and preparation
// =============================================================================

import { tool } from "ai";
import { z } from "zod";
import type { LanguageModel, Tool } from "ai";

import type { FilesystemPort } from "../ports/filesystem.port.js";
import type { McpPort } from "../ports/mcp.port.js";
import type { ApprovalConfig, SubagentConfig } from "../types.js";
import type { PluginContext, PluginRunMetadata, PluginSetupContext } from "../ports/plugin.port.js";
import type { RuntimePort } from "../ports/runtime.port.js";

import { PluginManager } from "../plugins/plugin-manager.js";
import { ApprovalManager } from "./approval-manager.js";
import { createFilesystemTools } from "../tools/filesystem/index.js";
import { createPlanningTools } from "../tools/planning/index.js";
import { createSubagentTools } from "../tools/subagent/index.js";
import { CircuitBreaker, RateLimiter, ToolCache } from "../adapters/resilience/index.js";

import type { EventBus } from "./event-bus.js";
import type { MemoryPort } from "../ports/memory.port.js";
import type { LearningPort } from "../ports/learning.port.js";

// =============================================================================
// Config subset needed by ToolManager
// =============================================================================

export interface ToolManagerConfig {
  model: LanguageModel;
  instructions: string;
  name?: string;
  maxSteps: number;
  fs: FilesystemPort;
  memory: MemoryPort;
  learning?: LearningPort;
  mcp?: McpPort;
  planning: boolean;
  subagents: boolean;
  subagentConfig?: Partial<SubagentConfig>;
  approvalConfig?: Required<ApprovalConfig>;
  extraTools?: Record<string, Tool>;
}

// =============================================================================
// ToolManager
// =============================================================================

export class ToolManager {
  private readonly config: ToolManagerConfig;
  private readonly pluginManager: PluginManager;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly rateLimiter?: RateLimiter;
  private readonly toolCache?: ToolCache;

  constructor(
    config: ToolManagerConfig,
    pluginManager: PluginManager,
    circuitBreaker?: CircuitBreaker,
    rateLimiter?: RateLimiter,
    toolCache?: ToolCache,
  ) {
    this.config = config;
    this.pluginManager = pluginManager;
    this.circuitBreaker = circuitBreaker;
    this.rateLimiter = rateLimiter;
    this.toolCache = toolCache;
  }

  // ---------------------------------------------------------------------------
  // Tool registration
  // ---------------------------------------------------------------------------

  private registerTools(
    target: Record<string, Tool>,
    source: Record<string, Tool>,
    sourceLabel: string,
  ): void {
    for (const [toolName, toolDef] of Object.entries(source)) {
      if (toolName in target) {
        throw new Error(`Tool "${toolName}" already registered (source: ${sourceLabel})`);
      }
      target[toolName] = toolDef;
    }
  }

  // ---------------------------------------------------------------------------
  // Build catalog
  // ---------------------------------------------------------------------------

  async buildToolCatalog(): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {};

    this.registerTools(tools, createFilesystemTools(this.config.fs), "filesystem");
    this.registerTools(tools, this.config.extraTools ?? {}, "builder.withTools");
    this.registerTools(tools, this.pluginManager.collectTools(), "plugins");

    if (this.config.planning) {
      this.registerTools(tools, createPlanningTools(this.config.fs), "planning");
    }

    if (this.config.subagents) {
      this.registerTools(
        tools,
        { ...createSubagentTools({
          parentModel: this.config.model,
          parentFilesystem: this.config.fs,
          maxDepth: this.config.subagentConfig?.maxDepth,
          timeoutMs: this.config.subagentConfig?.timeoutMs,
        }) },
        "subagents",
      );
    }

    if (this.config.mcp) {
      const mcpDefs = await this.config.mcp.discoverTools();
      const mcp = this.config.mcp;
      const mcpTools: Record<string, Tool> = {};

      for (const [name, def] of Object.entries(mcpDefs)) {
        mcpTools[`mcp:${name}`] = tool({
          description: def.description,
          inputSchema: z.object({}).passthrough(),
          execute: async (args: unknown) => {
            const result = await mcp.executeTool(name, args);
            if (result.isError) throw new Error(result.content[0]?.text ?? "MCP tool error");
            return result.content.map((c) => c.text ?? "").join("\n");
          },
        });
      }

      this.registerTools(tools, mcpTools, "mcp");
    }

    return tools;
  }

  // ---------------------------------------------------------------------------
  // Wrapping — delegates to standalone pure functions
  // ---------------------------------------------------------------------------

  wrapToolsWithApproval(
    tools: Record<string, Tool>,
    sessionId: string,
    eventBus: EventBus,
    runtime: RuntimePort,
  ): void {
    if (!this.config.approvalConfig) return;

    const approval = new ApprovalManager(
      this.config.approvalConfig,
      sessionId,
      (evt) => eventBus.emit(evt.type, evt.data),
    );

    applyApprovalWrapping(tools, approval, runtime);
  }

  wrapToolsWithResilience(tools: Record<string, Tool>): void {
    applyResilienceWrapping(tools, this.circuitBreaker, this.toolCache);
  }

  wrapToolsWithPlugins(
    tools: Record<string, Tool>,
    pluginCtx: PluginContext,
  ): void {
    applyPluginWrapping(tools, this.pluginManager, pluginCtx);
  }

  createRateLimitedModel(): LanguageModel {
    if (!this.rateLimiter) {
      return this.config.model;
    }

    const rateLimiter = this.rateLimiter;
    const originalModel = this.config.model;

    return new Proxy(originalModel as any, {
      get(target: any, prop: string | symbol, receiver: any) {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value === 'function' && prop === 'doGenerate') {
          return async function(...args: any[]) {
            await rateLimiter.acquire();
            return value.apply(target, args);
          };
        }

        if (typeof value === 'function' && prop === 'doStream') {
          return async function(...args: any[]) {
            await rateLimiter.acquire();
            return value.apply(target, args);
          };
        }

        return value;
      }
    }) as LanguageModel;
  }

  // ---------------------------------------------------------------------------
  // Full preparation pipeline
  // ---------------------------------------------------------------------------

  async prepareTools(
    sessionId: string,
    eventBus: EventBus,
    runtime: RuntimePort,
    runMetadata?: PluginRunMetadata,
  ): Promise<{ tools: Record<string, Tool>; pluginCtx: PluginContext }> {
    const tools = await this.buildToolCatalog();
    const toolNames = Object.keys(tools);
    const setupCtx = this.createPluginSetupContext(sessionId, toolNames, eventBus);
    await this.pluginManager.initialize(setupCtx);

    const pluginCtx = this.createPluginContext(sessionId, toolNames, runMetadata);
    this.wrapToolsWithApproval(tools, sessionId, eventBus, runtime);
    this.wrapToolsWithResilience(tools);
    this.wrapToolsWithPlugins(tools, pluginCtx);

    return { tools, pluginCtx };
  }

  // ---------------------------------------------------------------------------
  // Plugin context factories
  // ---------------------------------------------------------------------------

  createPluginContext(
    sessionId: string,
    toolNames: readonly string[],
    runMetadata?: PluginRunMetadata,
  ): PluginContext {
    return {
      sessionId,
      agentName: this.config.name,
      config: {
        instructions: this.config.instructions,
        maxSteps: this.config.maxSteps,
      },
      filesystem: this.config.fs,
      memory: this.config.memory,
      learning: this.config.learning,
      toolNames,
      runMetadata,
    };
  }

  private createPluginSetupContext(
    sessionId: string,
    toolNames: readonly string[],
    eventBus: EventBus,
  ): PluginSetupContext {
    return {
      ...this.createPluginContext(sessionId, toolNames),
      on: (eventType, handler) => eventBus.on(eventType, handler),
    };
  }
}

// =============================================================================
// Generic tool-wrapping utility
// =============================================================================

/** Iterates all executable tools and replaces each execute with the result of `wrapFn`. */
function wrapAllTools(
  tools: Record<string, Tool>,
  wrapFn: (name: string, originalExecute: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown,
): void {
  for (const [name, toolDef] of Object.entries(tools)) {
    if (!toolDef) continue;
    const maybeExecutable = toolDef as { execute?: (...args: unknown[]) => unknown };
    if (!maybeExecutable.execute) continue;
    const originalExecute = maybeExecutable.execute.bind(maybeExecutable);
    maybeExecutable.execute = wrapFn(name, originalExecute);
  }
}

// =============================================================================
// Standalone wrapping functions (SRP extraction)
// =============================================================================

/** Wraps each tool's execute with approval gating. */
function applyApprovalWrapping(
  tools: Record<string, Tool>,
  approval: ApprovalManager,
  runtime: RuntimePort,
): void {
  let stepIndex = 0;
  wrapAllTools(tools, (name, originalExecute) => async (...args: unknown[]) => {
    const { approved, reason } = await approval.checkAndApprove(
      name,
      runtime.randomUUID(),
      args[0],
      stepIndex++,
    );

    if (!approved) {
      return `Tool call denied: ${reason ?? "not approved"}`;
    }

    return originalExecute(...args);
  });
}

/** Wraps each tool's execute with circuit breaker and/or caching. */
function applyResilienceWrapping(
  tools: Record<string, Tool>,
  circuitBreaker?: CircuitBreaker,
  toolCache?: ToolCache,
): void {
  if (circuitBreaker) {
    wrapAllTools(tools, (_name, originalExecute) => async (...args: unknown[]): Promise<unknown> => {
      return circuitBreaker.execute(async () => originalExecute(...args));
    });
  }

  if (toolCache) {
    wrapAllTools(tools, (name, originalExecute) => async (...args: unknown[]): Promise<unknown> => {
      const cacheKey = `${name}:${JSON.stringify(args)}`;
      if (toolCache.has(cacheKey)) {
        return toolCache.get(cacheKey);
      }
      const result = await originalExecute(...args);
      toolCache.set(cacheKey, result);
      return result;
    });
  }
}

/** Wraps each tool's execute with plugin before/after/onError hooks. */
function applyPluginWrapping(
  tools: Record<string, Tool>,
  pluginManager: PluginManager,
  pluginCtx: PluginContext,
): void {
  if (pluginManager.count === 0) return;

  wrapAllTools(tools, (name, originalExecute) => async (...args: unknown[]) => {
    const beforeResult = await pluginManager.runBeforeTool(pluginCtx, {
      toolName: name,
      args: args[0],
    });

    if (beforeResult.skip) {
      return beforeResult.result;
    }

    const finalArgs = beforeResult.args !== undefined ? beforeResult.args : args[0];

    try {
      const result = await originalExecute(finalArgs, ...args.slice(1));
      await pluginManager.runAfterTool(pluginCtx, {
        toolName: name,
        args: finalArgs,
        result,
      });
      return result;
    } catch (error) {
      const onErrorResult = await pluginManager.runOnError(pluginCtx, {
        error,
        phase: "tool",
      });
      if (onErrorResult.suppress) return undefined;
      throw error;
    }
  });
}
