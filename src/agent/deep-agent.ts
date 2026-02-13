// =============================================================================
// DeepAgent — Orchestrator with builder pattern
// =============================================================================

import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { LanguageModel, Tool } from "ai";

import type { FilesystemPort } from "../ports/filesystem.port.js";
import type { MemoryPort } from "../ports/memory.port.js";
import type { TokenCounterPort } from "../ports/token-counter.port.js";
import type { McpPort } from "../ports/mcp.port.js";
import type { AgentEventHandler, AgentEventType, DeepAgentConfig, ApprovalConfig, CheckpointConfig, SubagentConfig } from "../types.js";

import { EventBus } from "./event-bus.js";
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

// =============================================================================
// Builder
// =============================================================================

export class DeepAgentBuilder {
  private readonly agentConfig: DeepAgentConfig;
  private maxStepsOverride?: number;

  private fs?: FilesystemPort;
  private memory?: MemoryPort;
  private tokenCounter?: TokenCounterPort;
  private mcp?: McpPort;

  private planning = false;
  private subagents = false;
  private subagentConfig?: Partial<SubagentConfig>;
  private approvalConfig?: Partial<ApprovalConfig>;

  private extraTools: Record<string, Tool> = {};

  private readonly eventHandlers: Array<{
    type: AgentEventType | "*";
    handler: AgentEventHandler;
  }> = [];

  constructor(config: DeepAgentConfig) {
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

  withTokenCounter(counter: TokenCounterPort): this {
    this.tokenCounter = counter;
    return this;
  }

  withMcp(mcp: McpPort): this {
    this.mcp = mcp;
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

  on(eventType: AgentEventType | "*", handler: AgentEventHandler): this {
    this.eventHandlers.push({ type: eventType, handler });
    return this;
  }

  build(): DeepAgent {
    if (!this.agentConfig.model) throw new Error("model is required");
    if (!this.agentConfig.instructions) throw new Error("instructions is required");

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
  planning: boolean;
  subagents: boolean;
  subagentConfig?: Partial<SubagentConfig>;
  approvalConfig?: Required<ApprovalConfig>;
  checkpointConfig?: Required<CheckpointConfig>;
  extraTools?: Record<string, Tool>;
}

export class DeepAgent {
  readonly sessionId: string;
  readonly eventBus: EventBus;

  private readonly config: DeepAgentInternalConfig;
  private readonly tokenTracker: TokenTracker;

  constructor(config: DeepAgentInternalConfig) {
    this.sessionId = config.id ?? crypto.randomUUID();
    this.eventBus = new EventBus(this.sessionId);
    this.config = config;
    this.tokenTracker = new TokenTracker(config.tokenCounter, {
      maxInputTokens: Infinity,
      maxOutputTokens: Infinity,
      maxTotalTokens: Infinity,
      warningThreshold: 0.9,
    });
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

  private async buildTools(): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {
      ...createFilesystemTools(this.config.fs),
      ...(this.config.extraTools ?? {}),
    };

    if (this.config.planning) {
      Object.assign(tools, createPlanningTools(this.config.fs));
    }

    if (this.config.subagents) {
      Object.assign(
        tools,
        createSubagentTools({
          parentModel: this.config.model,
          parentFilesystem: this.config.fs,
          maxDepth: this.config.subagentConfig?.maxDepth,
          timeoutMs: this.config.subagentConfig?.timeoutMs,
        }),
      );
    }

    // MCP tools: discover and merge with namespace prefix
    if (this.config.mcp) {
      const mcpDefs = await this.config.mcp.discoverTools();
      const mcp = this.config.mcp;
      for (const [name, def] of Object.entries(mcpDefs)) {
        tools[`mcp:${name}`] = tool({
          description: def.description,
          inputSchema: z.object({}).passthrough(),
          execute: async (args: unknown) => {
            const result = await mcp.executeTool(name, args);
            if (result.isError) throw new Error(result.content[0]?.text ?? "MCP tool error");
            return result.content.map((c) => c.text ?? "").join("\n");
          },
        });
      }
    }

    // Approval: wrap tool execute fns with approval gate
    const approval = this.config.approvalConfig
      ? new ApprovalManager(
          this.config.approvalConfig,
          this.sessionId,
          (evt) => this.eventBus.emit(evt.type, evt.data),
        )
      : undefined;

    if (approval) {
      let stepIndex = 0;
      for (const [name, t] of Object.entries(tools)) {
        const original = t as { execute?: (...args: unknown[]) => unknown };
        if (!original.execute) continue;
        const origExec = original.execute.bind(original);
        original.execute = async (...args: unknown[]) => {
          const { approved, reason } = await approval.checkAndApprove(
            name, crypto.randomUUID(), args[0], stepIndex++,
          );
          if (!approved) return `Tool call denied: ${reason ?? "not approved"}`;
          return origExec(...args);
        };
      }
    }

    return tools;
  }

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  // Approval is implemented via tool wrapper pattern rather than AI SDK's
  // toolCallConfirmation, as ToolLoopAgent does not expose this option.
  // Each tool's execute function is wrapped with ApprovalManager.checkAndApprove()
  // when approval config has a non-empty requireApproval list.

  async run(prompt: string): Promise<DeepAgentResult> {
    this.eventBus.emit("agent:start", { prompt });

    // --- Checkpoint: try loading latest ---
    const cpConfig = this.config.checkpointConfig;
    if (cpConfig?.enabled) {
      const cp = await this.config.memory.loadLatestCheckpoint(this.sessionId);
      if (cp) this.eventBus.emit("checkpoint:load", { checkpoint: cp });
    }

    const tools = await this.buildTools();

    try {
      const agent = new ToolLoopAgent({
        model: this.config.model,
        instructions: this.config.instructions,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps),
      });

      const result = await agent.generate({ prompt });

      // --- Token tracking ---
      const usage = (result as unknown as Record<string, unknown>).usage as
        | { promptTokens?: number; completionTokens?: number }
        | undefined;
      if (usage) {
        if (usage.promptTokens) this.tokenTracker.addInput(usage.promptTokens);
        if (usage.completionTokens) this.tokenTracker.addOutput(usage.completionTokens);
      }

      // --- Step events ---
      const steps = (result.steps ?? []) as unknown[];
      for (let i = 0; i < steps.length; i++) {
        this.eventBus.emit("step:start", { stepIndex: i, step: steps[i] });
        this.eventBus.emit("step:end", { stepIndex: i, step: steps[i] });
      }

      // --- Checkpoint: save after run ---
      if (cpConfig?.enabled) {
        const checkpoint = {
          id: crypto.randomUUID(),
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
        steps: steps,
        sessionId: this.sessionId,
      };

      this.eventBus.emit("agent:stop", { result: agentResult });
      return agentResult;
    } catch (error: unknown) {
      this.eventBus.emit("error", { error });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Stream — returns a ToolLoopAgent-compatible streaming interface
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async stream(params: { messages: Array<{ role: string; content: unknown }> }): Promise<any> {
    this.eventBus.emit("agent:start", { messages: params.messages });

    const tools = await this.buildTools();

    const agent = new ToolLoopAgent({
      model: this.config.model,
      instructions: this.config.instructions,
      tools,
      stopWhen: stepCountIs(this.config.maxSteps),
    });

    return agent.stream(params as Parameters<typeof agent.stream>[0]);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async dispose(): Promise<void> {
    if (this.config.mcp) await this.config.mcp.closeAll();
    this.eventBus.removeAllListeners();
  }
}
