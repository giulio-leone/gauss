// =============================================================================
// DeepAgent — Execution orchestrator (SRP: building logic in deep-agent-builder.ts)
// =============================================================================

import type { LanguageModel, Tool } from "ai";

import type { FilesystemPort } from "../ports/filesystem.port.js";
import type { MemoryPort } from "../ports/memory.port.js";
import type { LearningPort } from "../ports/learning.port.js";
import type { TokenCounterPort } from "../ports/token-counter.port.js";
import type { McpPort } from "../ports/mcp.port.js";
import type { DeepAgentConfig, CheckpointConfig, SubagentConfig, ApprovalConfig } from "../types.js";
import type { DeepAgentPlugin, PluginRunMetadata } from "../ports/plugin.port.js";
import type { RuntimePort } from "../ports/runtime.port.js";
import { createRuntimeAdapterAsync } from "../adapters/runtime/detect-runtime.js";

import { EventBus } from "./event-bus.js";
import { PluginManager } from "../plugins/plugin-manager.js";
import { TokenTracker } from "../context/token-tracker.js";
import { CircuitBreaker, RateLimiter, ToolCache } from "../adapters/resilience/index.js";
import { ToolManager } from "./tool-manager.js";
import { ExecutionEngine } from "./execution-engine.js";
import { LifecycleManager, type LifecycleHooks, type HealthStatus } from "./lifecycle.js";

// Builder is imported for use in static factory methods
import { DeepAgentBuilder } from "./deep-agent-builder.js";

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

// Re-export builder for backward compatibility
export { DeepAgentBuilder } from "./deep-agent-builder.js";

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
  lifecycleHooks?: LifecycleHooks;
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
  private readonly lifecycleManager: LifecycleManager;
  
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

    // Initialize lifecycle manager
    this.lifecycleManager = new LifecycleManager(config.lifecycleHooks ?? {});

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
  // Lifecycle Management
  // ---------------------------------------------------------------------------

  async startup(): Promise<void> {
    return this.lifecycleManager.startup();
  }

  async shutdown(): Promise<void> {
    return this.lifecycleManager.shutdown();
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.lifecycleManager.healthCheck();
  }

  get isReady(): boolean {
    return this.lifecycleManager.isReady;
  }

  get isShuttingDown(): boolean {
    return this.lifecycleManager.isShuttingDown;
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
      await this.lifecycleManager.shutdown();
    } catch {
      // Continue with cleanup even if shutdown fails
    }
    
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