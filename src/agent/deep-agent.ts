// =============================================================================
// DeepAgent — Orchestrator with builder pattern
// =============================================================================

import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { LanguageModel, Tool } from "ai";

import type { FilesystemPort } from "../ports/filesystem.port.js";
import type { MemoryPort } from "../ports/memory.port.js";
import type { LearningPort } from "../ports/learning.port.js";
import type { TokenCounterPort } from "../ports/token-counter.port.js";
import type { McpPort } from "../ports/mcp.port.js";
import type { AgentEventHandler, AgentEventType, DeepAgentConfig, ApprovalConfig, CheckpointConfig, SubagentConfig } from "../types.js";
import type { DeepAgentPlugin, PluginContext, PluginRunMetadata, PluginSetupContext } from "../ports/plugin.port.js";
import type { UserProfile, UserMemory } from "../domain/learning.schema.js";
import type { RuntimePort } from "../ports/runtime.port.js";
import { createRuntimeAdapter } from "../adapters/runtime/detect-runtime.js";

import { AbstractBuilder } from "../utils/abstract-builder.js";
import { EventBus } from "./event-bus.js";
import { PluginManager } from "../plugins/plugin-manager.js";
import { ApprovalManager } from "./approval-manager.js";
import { resolveApprovalConfig, resolveCheckpointConfig } from "./agent-config.js";
import { TokenTracker } from "../context/token-tracker.js";
import { VirtualFilesystem } from "../adapters/filesystem/virtual-fs.adapter.js";
import { InMemoryAdapter } from "../adapters/memory/in-memory.adapter.js";
import { ApproximateTokenCounter } from "../adapters/token-counter/approximate.adapter.js";
import { createFilesystemTools } from "../tools/filesystem/index.js";
import { createPlanningTools } from "../tools/planning/index.js";
import { createSubagentTools } from "../tools/subagent/index.js";

// =============================================================================
// Result type
// =============================================================================

export interface DeepAgentResult {
  text: string;
  steps: unknown[];
  sessionId: string;
}

export interface DeepAgentRunOptions {
  pluginMetadata?: PluginRunMetadata;
}

// =============================================================================
// Builder
// =============================================================================

export class DeepAgentBuilder extends AbstractBuilder<DeepAgent> {
  private readonly agentConfig: DeepAgentConfig;
  private maxStepsOverride?: number;

  private fs?: FilesystemPort;
  private memory?: MemoryPort;
  private learning?: LearningPort;
  private userId?: string;
  private tokenCounter?: TokenCounterPort;
  private mcp?: McpPort;
  private runtime?: RuntimePort;

  private planning = false;
  private subagents = false;
  private subagentConfig?: Partial<SubagentConfig>;
  private approvalConfig?: Partial<ApprovalConfig>;

  private extraTools: Record<string, Tool> = {};
  private readonly plugins: DeepAgentPlugin[] = [];

  private readonly eventHandlers: Array<{
    type: AgentEventType | "*";
    handler: AgentEventHandler;
  }> = [];

  constructor(config: DeepAgentConfig) {
    super();
    this.agentConfig = config;
  }

  withFilesystem(fs: FilesystemPort): this {
    this.fs = fs;
    return this;
  }

  withMemory(memory: MemoryPort): this {
    this.memory = memory;
    return this;
  }

  withLearning(learning: LearningPort, userId?: string): this {
    this.learning = learning;
    this.userId = userId;
    return this;
  }

  withTokenCounter(counter: TokenCounterPort): this {
    this.tokenCounter = counter;
    return this;
  }

  withMcp(mcp: McpPort): this {
    this.mcp = mcp;
    return this;
  }

  withRuntime(runtime: RuntimePort): this {
    this.runtime = runtime;
    return this;
  }

  withPlanning(): this {
    this.planning = true;
    return this;
  }

  withSubagents(
    config?: Partial<SubagentConfig>,
  ): this {
    this.subagents = true;
    this.subagentConfig = config;
    return this;
  }

  withTools(tools: Record<string, Tool>): this {
    Object.assign(this.extraTools, tools);
    return this;
  }

  withApproval(
    config?: Partial<ApprovalConfig>,
  ): this {
    this.approvalConfig = config;
    return this;
  }

  withMaxSteps(n: number): this {
    this.maxStepsOverride = n;
    return this;
  }

  use(plugin: DeepAgentPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  on(eventType: AgentEventType | "*", handler: AgentEventHandler): this {
    this.eventHandlers.push({ type: eventType, handler });
    return this;
  }

  protected validate(): void {
    if (!this.agentConfig.model) throw new Error("model is required");
    if (!this.agentConfig.instructions) throw new Error("instructions is required");
  }

  protected construct(): DeepAgent {
    const fs = this.fs ?? new VirtualFilesystem();
    const memory = this.memory ?? new InMemoryAdapter();
    const tokenCounter = this.tokenCounter ?? new ApproximateTokenCounter();
    const maxSteps = this.maxStepsOverride ?? this.agentConfig.maxSteps ?? 30;

    const agent = new DeepAgent({
      model: this.agentConfig.model,
      instructions: this.agentConfig.instructions,
      id: this.agentConfig.id,
      name: this.agentConfig.name,
      maxSteps,
      fs,
      memory,
      tokenCounter,
      mcp: this.mcp,
      runtime: this.runtime,
      learning: this.learning,
      userId: this.userId,
      planning: this.planning,
      subagents: this.subagents,
      subagentConfig: this.subagentConfig,
      approvalConfig: this.approvalConfig
        ? resolveApprovalConfig(this.approvalConfig)
        : undefined,
      checkpointConfig: resolveCheckpointConfig(
        this.agentConfig.checkpoint,
      ),
      extraTools: this.extraTools,
      plugins: this.plugins,
    });

    for (const { type, handler } of this.eventHandlers) {
      agent.eventBus.on(type, handler);
    }

    return agent;
  }
}

// =============================================================================
// DeepAgent
// =============================================================================

interface DeepAgentInternalConfig {
  model: LanguageModel;
  instructions: string;
  id?: string;
  name?: string;
  maxSteps: number;
  fs: FilesystemPort;
  memory: MemoryPort;
  tokenCounter: TokenCounterPort;
  mcp?: McpPort;
  runtime?: RuntimePort;
  learning?: LearningPort;
  userId?: string;
  planning: boolean;
  subagents: boolean;
  subagentConfig?: Partial<SubagentConfig>;
  approvalConfig?: Required<ApprovalConfig>;
  checkpointConfig?: Required<CheckpointConfig>;
  extraTools?: Record<string, Tool>;
  plugins?: DeepAgentPlugin[];
}

export class DeepAgent {
  readonly sessionId: string;
  readonly eventBus: EventBus;

  private readonly config: DeepAgentInternalConfig;
  private readonly runtime: RuntimePort;
  private readonly tokenTracker: TokenTracker;
  private readonly pluginManager: PluginManager;

  constructor(config: DeepAgentInternalConfig) {
    this.runtime = config.runtime ?? createRuntimeAdapter();
    this.sessionId = config.id ?? this.runtime.randomUUID();
    this.eventBus = new EventBus(this.sessionId);
    this.config = config;
    this.tokenTracker = new TokenTracker(config.tokenCounter, {
      maxInputTokens: Infinity,
      maxOutputTokens: Infinity,
      maxTotalTokens: Infinity,
      warningThreshold: 0.9,
    });
    this.pluginManager = new PluginManager();
    for (const plugin of config.plugins ?? []) {
      this.pluginManager.register(plugin);
    }
  }

  // ---------------------------------------------------------------------------
  // Static factories
  // ---------------------------------------------------------------------------

  static create(config: DeepAgentConfig): DeepAgentBuilder {
    return new DeepAgentBuilder(config);
  }

  static minimal(config: DeepAgentConfig): DeepAgent {
    return DeepAgent.create(config).withPlanning().build();
  }

  static full(config: DeepAgentConfig & {
    memory?: MemoryPort;
    mcp?: McpPort;
    tokenCounter?: TokenCounterPort;
  }): DeepAgent {
    const builder = DeepAgent.create(config).withPlanning().withSubagents();
    if (config.memory) builder.withMemory(config.memory);
    if (config.mcp) builder.withMcp(config.mcp);
    if (config.tokenCounter) builder.withTokenCounter(config.tokenCounter);
    return builder.build();
  }

  /**
   * Auto-configuring factory that works in any runtime.
   * Uses universal adapters (VirtualFilesystem, InMemoryAdapter, ApproximateTokenCounter)
   * that require zero platform-specific APIs.
   *
   * For runtime-specific adapters (LocalFilesystem, DenoFilesystem, OpfsFilesystem, etc.),
   * use `DeepAgent.create()` and compose manually.
   */
  static auto(config: DeepAgentConfig): DeepAgent {
    return DeepAgent.create(config).withPlanning().build();
  }

  // ---------------------------------------------------------------------------
  // Private: build merged tool set
  // ---------------------------------------------------------------------------

  private createPluginContext(
    toolNames: readonly string[],
    runMetadata?: PluginRunMetadata,
  ): PluginContext {
    return {
      sessionId: this.sessionId,
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

  private createPluginSetupContext(toolNames: readonly string[]): PluginSetupContext {
    return {
      ...this.createPluginContext(toolNames),
      on: (eventType, handler) => this.eventBus.on(eventType, handler),
    };
  }

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

  private async buildToolCatalog(): Promise<Record<string, Tool>> {
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
        createSubagentTools({
          parentModel: this.config.model,
          parentFilesystem: this.config.fs,
          maxDepth: this.config.subagentConfig?.maxDepth,
          timeoutMs: this.config.subagentConfig?.timeoutMs,
        }) as unknown as Record<string, Tool>,
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

  private wrapToolsWithApproval(tools: Record<string, Tool>): void {
    if (!this.config.approvalConfig) return;

    const approval = new ApprovalManager(
      this.config.approvalConfig,
      this.sessionId,
      (evt) => this.eventBus.emit(evt.type, evt.data),
    );
    const runtime = this.runtime;

    let stepIndex = 0;
    for (const [name, toolDef] of Object.entries(tools)) {
      const maybeExecutable = toolDef as { execute?: (...args: unknown[]) => unknown };
      if (!maybeExecutable.execute) continue;

      const originalExecute = maybeExecutable.execute.bind(maybeExecutable);

      maybeExecutable.execute = async (...args: unknown[]) => {
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
      };
    }
  }

  private wrapToolsWithPlugins(
    tools: Record<string, Tool>,
    pluginCtx: PluginContext,
  ): void {
    if (this.pluginManager.count === 0) return;

    for (const [name, toolDef] of Object.entries(tools)) {
      const maybeExecutable = toolDef as { execute?: (...args: unknown[]) => unknown };
      if (!maybeExecutable.execute) continue;

      const originalExecute = maybeExecutable.execute.bind(maybeExecutable);

      maybeExecutable.execute = async (...args: unknown[]) => {
        const beforeResult = await this.pluginManager.runBeforeTool(pluginCtx, {
          toolName: name,
          args: args[0],
        });

        if (beforeResult.skip) {
          return beforeResult.result;
        }

        const finalArgs = beforeResult.args !== undefined ? beforeResult.args : args[0];

        try {
          const result = await originalExecute(finalArgs, ...args.slice(1));
          await this.pluginManager.runAfterTool(pluginCtx, {
            toolName: name,
            args: finalArgs,
            result,
          });
          return result;
        } catch (error) {
          const onErrorResult = await this.pluginManager.runOnError(pluginCtx, {
            error,
            phase: "tool",
          });
          if (onErrorResult.suppress) return undefined;
          throw error;
        }
      };
    }
  }

  private async prepareTools(
    runMetadata?: PluginRunMetadata,
  ): Promise<{ tools: Record<string, Tool>; pluginCtx: PluginContext }> {
    const tools = await this.buildToolCatalog();
    const toolNames = Object.keys(tools);
    const setupCtx = this.createPluginSetupContext(toolNames);
    await this.pluginManager.initialize(setupCtx);

    const pluginCtx = this.createPluginContext(toolNames, runMetadata);
    this.wrapToolsWithApproval(tools);
    this.wrapToolsWithPlugins(tools, pluginCtx);

    return { tools, pluginCtx };
  }

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  // Approval is implemented via tool wrapper pattern rather than AI SDK's
  // toolCallConfirmation, as ToolLoopAgent does not expose this option.
  // Each tool's execute function is wrapped with ApprovalManager.checkAndApprove()
  // when approval config has a non-empty requireApproval list.

  async run(prompt: string, options: DeepAgentRunOptions = {}): Promise<DeepAgentResult> {
    let pluginCtx = this.createPluginContext([], options.pluginMetadata);

    try {
      const prepared = await this.prepareTools(options.pluginMetadata);
      const tools = prepared.tools;
      pluginCtx = prepared.pluginCtx;

      // Inject learning context if available
      if (this.config.learning) {
        const userId = this.config.userId ?? this.sessionId;
        const profile = await this.config.learning.getProfile(userId);
        const memories = await this.config.learning.getMemories(userId, { limit: 10 });
        const learningContext = this.buildLearningContext(profile, memories);
        if (learningContext) prompt = `${learningContext}\n\n${prompt}`;
      }

      const beforeRunResult = await this.pluginManager.runBeforeRun(pluginCtx, { prompt });
      if (beforeRunResult.prompt !== undefined) {
        prompt = beforeRunResult.prompt;
      }

      this.eventBus.emit("agent:start", { prompt });

      const cpConfig = this.config.checkpointConfig;
      if (cpConfig?.enabled) {
        const cp = await this.config.memory.loadLatestCheckpoint(this.sessionId);
        if (cp) this.eventBus.emit("checkpoint:load", { checkpoint: cp });
      }

      const agent = new ToolLoopAgent({
        model: this.config.model,
        instructions: this.config.instructions,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps),
      });

      const result = await agent.generate({ prompt });

      const usage = (result as unknown as Record<string, unknown>).usage as
        | { promptTokens?: number; completionTokens?: number }
        | undefined;
      if (usage) {
        if (usage.promptTokens) this.tokenTracker.addInput(usage.promptTokens);
        if (usage.completionTokens) this.tokenTracker.addOutput(usage.completionTokens);
      }

      const steps = (result.steps ?? []) as unknown[];
      for (let i = 0; i < steps.length; i++) {
        let step = steps[i];

        try {
          const beforeStepResult = await this.pluginManager.runBeforeStep(pluginCtx, {
            stepIndex: i,
            step,
          });

          if (beforeStepResult.skip) continue;
          if (beforeStepResult.step !== undefined) {
            step = beforeStepResult.step;
            steps[i] = step;
          }

          this.eventBus.emit("step:start", { stepIndex: i, step });
          this.eventBus.emit("step:end", { stepIndex: i, step });

          await this.pluginManager.runAfterStep(pluginCtx, {
            stepIndex: i,
            step,
          });
        } catch (error) {
          const onStepError = await this.pluginManager.runOnError(pluginCtx, {
            error,
            phase: "step",
          });
          if (!onStepError.suppress) throw error;
        }
      }

      if (cpConfig?.enabled) {
        const checkpoint = {
          id: this.runtime.randomUUID(),
          sessionId: this.sessionId,
          stepIndex: steps.length,
          conversation: [
            { role: "user" as const, content: prompt },
            { role: "assistant" as const, content: result.text ?? "" },
          ],
          todos: await this.config.memory.loadTodos(this.sessionId),
          filesSnapshot: {},
          toolResults: {},
          generatedTokens: 0,
          lastToolCallId: null,
          metadata: {},
          createdAt: Date.now(),
        };
        await this.config.memory.saveCheckpoint(this.sessionId, checkpoint);
        this.eventBus.emit("checkpoint:save", { checkpoint });
      }

      const agentResult: DeepAgentResult = {
        text: result.text ?? "",
        steps,
        sessionId: this.sessionId,
      };

      this.eventBus.emit("agent:stop", { result: agentResult });
      await this.pluginManager.runAfterRun(pluginCtx, { result: agentResult });
      return agentResult;
    } catch (error: unknown) {
      const onErrorResult = await this.pluginManager.runOnError(pluginCtx, {
        error,
        phase: "run",
      });
      if (onErrorResult.suppress) {
        return { text: "", steps: [], sessionId: this.sessionId };
      }
      this.eventBus.emit("error", { error });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Stream — returns a ToolLoopAgent-compatible streaming interface
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async stream(
    params: { messages: Array<{ role: string; content: unknown }> },
    options: DeepAgentRunOptions = {},
  ): Promise<any> {
    let pluginCtx = this.createPluginContext([], options.pluginMetadata);

    try {
      const prepared = await this.prepareTools(options.pluginMetadata);
      const tools = prepared.tools;
      pluginCtx = prepared.pluginCtx;

      // Inject learning context as a system message
      if (this.config.learning) {
        const userId = this.config.userId ?? this.sessionId;
        const [profile, memories] = await Promise.all([
          this.config.learning.getProfile(userId),
          this.config.learning.getMemories(userId, { limit: 10 }),
        ]);
        const learningContext = this.buildLearningContext(profile, memories);
        if (learningContext) {
          params = {
            ...params,
            messages: [
              { role: "system", content: learningContext },
              ...params.messages,
            ],
          };
        }
      }

      this.eventBus.emit("agent:start", { messages: params.messages });

      const agent = new ToolLoopAgent({
        model: this.config.model,
        instructions: this.config.instructions,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps),
      });

      return agent.stream(params as Parameters<typeof agent.stream>[0]);
    } catch (error: unknown) {
      const onErrorResult = await this.pluginManager.runOnError(pluginCtx, {
        error,
        phase: "stream",
      });
      if (onErrorResult.suppress) {
        return new ReadableStream({ start(c) { c.close(); } });
      }
      this.eventBus.emit("error", { error });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Learning context
  // ---------------------------------------------------------------------------

  private buildLearningContext(profile: UserProfile | null, memories: UserMemory[]): string {
    const parts: string[] = [];
    if (profile) {
      if (profile.context) parts.push(`User context: ${profile.context}`);
      if (profile.style) parts.push(`Preferred style: ${profile.style}`);
      if (profile.language) parts.push(`Language: ${profile.language}`);
    }
    if (memories.length > 0) {
      parts.push(`Known facts about this user:\n${memories.map((m) => `- ${m.content}`).join("\n")}`);
    }
    return parts.length > 0 ? `[Learning Context]\n${parts.join("\n")}` : "";
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async dispose(): Promise<void> {
    try {
      await this.pluginManager.dispose();
    } finally {
      try {
        if (this.config.mcp) await this.config.mcp.closeAll();
      } finally {
        this.eventBus.removeAllListeners();
      }
    }
  }
}
