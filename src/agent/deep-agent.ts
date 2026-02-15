// =============================================================================
// DeepAgent — Orchestrator with builder pattern (Refactored for SRP)
// =============================================================================

import type { LanguageModel, Tool } from "ai";

import type { FilesystemPort } from "../ports/filesystem.port.js";
import type { MemoryPort } from "../ports/memory.port.js";
import type { LearningPort } from "../ports/learning.port.js";
import type { TokenCounterPort } from "../ports/token-counter.port.js";
import type { McpPort } from "../ports/mcp.port.js";
import type { AgentEventHandler, AgentEventType, DeepAgentConfig, ApprovalConfig, CheckpointConfig, SubagentConfig } from "../types.js";
import type { DeepAgentPlugin, PluginContext, PluginRunMetadata, PluginSetupContext } from "../ports/plugin.port.js";
import type { RuntimePort } from "../ports/runtime.port.js";
import { createRuntimeAdapterAsync } from "../adapters/runtime/detect-runtime.js";

import { AbstractBuilder } from "../utils/abstract-builder.js";
import { EventBus } from "./event-bus.js";
import { PluginManager } from "../plugins/plugin-manager.js";
import { resolveApprovalConfig, resolveCheckpointConfig } from "./agent-config.js";
import { TokenTracker } from "../context/token-tracker.js";
import { VirtualFilesystem } from "../adapters/filesystem/virtual-fs.adapter.js";
import { InMemoryAdapter } from "../adapters/memory/in-memory.adapter.js";
import { ApproximateTokenCounter } from "../adapters/token-counter/approximate.adapter.js";
import { CircuitBreaker, RateLimiter, ToolCache, DEFAULT_CIRCUIT_BREAKER_CONFIG, DEFAULT_RATE_LIMITER_CONFIG, DEFAULT_TOOL_CACHE_CONFIG } from "../adapters/resilience/index.js";
import type { CircuitBreakerConfig, RateLimiterConfig, ToolCacheConfig } from "../adapters/resilience/index.js";
import { ToolManager } from "./tool-manager.js";
import { ExecutionEngine } from "./execution-engine.js";

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

  // Resilience patterns
  private circuitBreaker?: CircuitBreaker;
  private rateLimiter?: RateLimiter;
  private toolCache?: ToolCache;

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

  withSubagents(config?: Partial<SubagentConfig>): this {
    this.subagents = true;
    this.subagentConfig = config;
    return this;
  }

  withApproval(config?: Partial<ApprovalConfig>): this {
    this.approvalConfig = config;
    return this;
  }

  withMaxSteps(steps: number): this {
    this.maxStepsOverride = steps;
    return this;
  }

  withCircuitBreaker(config?: Partial<CircuitBreakerConfig>): this {
    this.circuitBreaker = new CircuitBreaker({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config });
    return this;
  }

  withRateLimiter(config?: Partial<RateLimiterConfig>): this {
    this.rateLimiter = new RateLimiter({ ...DEFAULT_RATE_LIMITER_CONFIG, ...config });
    return this;
  }

  withToolCache(config?: Partial<ToolCacheConfig>): this {
    this.toolCache = new ToolCache({ ...DEFAULT_TOOL_CACHE_CONFIG, ...config });
    return this;
  }

  withTools(tools: Record<string, Tool>): this {
    Object.assign(this.extraTools, tools);
    return this;
  }

  withTool(name: string, tool: Tool): this {
    this.extraTools[name] = tool;
    return this;
  }

  withPlugin(plugin: DeepAgentPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  on(type: AgentEventType | "*", handler: AgentEventHandler): this {
    this.eventHandlers.push({ type, handler });
    return this;
  }

  protected validate(): void {
    if (!this.agentConfig.model) throw new Error("model is required");
    if (!this.agentConfig.instructions) throw new Error("instructions is required");
  }

  protected construct(): DeepAgent {
    const agent = new DeepAgent({
      model: this.agentConfig.model,
      instructions: this.agentConfig.instructions,
      id: this.agentConfig.id,
      name: this.agentConfig.name,
      maxSteps: this.maxStepsOverride ?? this.agentConfig.maxSteps ?? 30,
      fs: this.fs ?? new VirtualFilesystem(),
      memory: this.memory ?? new InMemoryAdapter(),
      learning: this.learning,
      userId: this.userId,
      tokenCounter: this.tokenCounter ?? new ApproximateTokenCounter(),
      mcp: this.mcp,
      runtime: this.runtime,
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
      circuitBreaker: this.circuitBreaker,
      rateLimiter: this.rateLimiter,
      toolCache: this.toolCache,
    });

    for (const { type, handler } of this.eventHandlers) {
      agent.eventBus.on(type, handler);
    }

    return agent;
  }

  build(): DeepAgent {
    return super.build();
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
  circuitBreaker?: CircuitBreaker;
  rateLimiter?: RateLimiter;
  toolCache?: ToolCache;
}

export class DeepAgent {
  readonly sessionId: string;
  readonly eventBus: EventBus;

  private readonly config: DeepAgentInternalConfig;
  private _runtime: RuntimePort | null;
  private _runtimePromise: Promise<RuntimePort> | null = null;
  private readonly tokenTracker: TokenTracker;
  private readonly pluginManager: PluginManager;
  private readonly toolManager: ToolManager;
  private readonly executionEngine: ExecutionEngine;
  
  // Resilience patterns
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly rateLimiter?: RateLimiter;
  private readonly toolCache?: ToolCache;

  constructor(config: DeepAgentInternalConfig) {
    this._runtime = config.runtime ?? null;
    this.sessionId = config.id ?? (this._runtime ? this._runtime.randomUUID() : crypto.randomUUID());
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
    
    // Initialize resilience patterns
    this.circuitBreaker = config.circuitBreaker;
    this.rateLimiter = config.rateLimiter;
    this.toolCache = config.toolCache;

    // Initialize ToolManager and ExecutionEngine
    this.toolManager = new ToolManager(
      {
        model: config.model,
        instructions: config.instructions,
        name: config.name,
        maxSteps: config.maxSteps,
        fs: config.fs,
        memory: config.memory,
        learning: config.learning,
        mcp: config.mcp,
        planning: config.planning,
        subagents: config.subagents,
        subagentConfig: config.subagentConfig,
        approvalConfig: config.approvalConfig,
        extraTools: config.extraTools,
      },
      this.pluginManager,
      this.circuitBreaker,
      this.rateLimiter,
      this.toolCache,
    );

    this.executionEngine = new ExecutionEngine(
      {
        model: config.model,
        instructions: config.instructions,
        maxSteps: config.maxSteps,
        memory: config.memory,
        learning: config.learning,
        userId: config.userId,
        checkpointConfig: config.checkpointConfig,
      },
      this.toolManager,
      this.pluginManager,
      this.eventBus,
      this.tokenTracker,
    );
  }

  /** Lazy-initialized runtime adapter. Resolves on first use. */
  private async ensureRuntime(): Promise<RuntimePort> {
    if (this._runtime) return this._runtime;
    if (!this._runtimePromise) {
      this._runtimePromise = createRuntimeAdapterAsync().then((rt) => {
        this._runtime = rt;
        return rt;
      });
    }
    return this._runtimePromise;
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
  // Run & Stream - Delegation to ExecutionEngine
  // ---------------------------------------------------------------------------

  async run(prompt: string, options: DeepAgentRunOptions = {}): Promise<DeepAgentResult> {
    await this.ensureRuntime();
    return this.executionEngine.run(prompt, this.sessionId, this._runtime!, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async stream(
    params: { messages: Array<{ role: string; content: unknown }> },
    options: DeepAgentRunOptions = {},
  ): Promise<any> {
    await this.ensureRuntime();
    return this.executionEngine.stream(params, this.sessionId, this._runtime!, options);
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