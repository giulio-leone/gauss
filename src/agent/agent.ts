// =============================================================================
// Agent — Execution orchestrator (SRP: building logic in agent-builder.ts)
// =============================================================================

import type { LanguageModel, Tool } from "ai";

import type { FilesystemPort } from "../ports/filesystem.port.js";
import type { MemoryPort } from "../ports/memory.port.js";
import type { LearningPort } from "../ports/learning.port.js";
import type { TokenCounterPort } from "../ports/token-counter.port.js";
import type { McpPort } from "../ports/mcp.port.js";
import type {
  PolicyContext,
  PolicyEnginePort,
} from "../ports/policy.port.js";
import type { TelemetryPort } from "../ports/telemetry.port.js";
import type { CostTrackerPort } from "../ports/cost-tracker.port.js";
import type {
  AgentConfig,
  CheckpointConfig,
  SubagentConfig,
  ApprovalConfig,
  McpToolsetSelection,
} from "../types.js";
import type { Plugin, PluginRunMetadata } from "../ports/plugin.port.js";
import type { RuntimePort } from "../ports/runtime.port.js";
import type { MiddlewarePort } from "../ports/middleware.port.js";
import { createRuntimeAdapterAsync } from "../adapters/runtime/detect-runtime.js";

import { EventBus } from "./event-bus.js";
import { PluginManager } from "../plugins/plugin-manager.js";
import { TokenTracker } from "../context/token-tracker.js";
import { CircuitBreaker, RateLimiter, ToolCache } from "../adapters/resilience/index.js";
import { ToolManager } from "./tool-manager.js";
import { ExecutionEngine } from "./execution-engine.js";
import { LifecycleManager, type LifecycleHooks, type HealthStatus } from "./lifecycle.js";
import { MiddlewareChain } from "../middleware/chain.js";

// Builder is imported for use in static factory methods
import { AgentBuilder } from "./agent-builder.js";

// =============================================================================
// Result type
// =============================================================================

export interface AgentResult<TOutput = unknown> {
  text: string;
  steps: unknown[];
  sessionId: string;
  /** Parsed structured output when `output` is configured via builder or run options. */
  output?: TOutput;
  /** Tool calls extracted from all steps. */
  toolCalls: Array<{ name: string; args?: unknown; stepIndex: number }>;
}

export interface AgentRunOptions {
  pluginMetadata?: PluginRunMetadata;
  mcpToolset?: McpToolsetSelection;
  policyContext?: PolicyContext;
}

// Re-export builder for backward compatibility
export { AgentBuilder } from "./agent-builder.js";

// =============================================================================
// Agent
// =============================================================================

interface AgentInternalConfig {
  model: LanguageModel;
  instructions: string;
  id?: string;
  name?: string;
  maxSteps: number;
  fs: FilesystemPort;
  memory: MemoryPort;
  tokenCounter: TokenCounterPort;
  mcp?: McpPort;
  policyEngine?: PolicyEnginePort;
  runtime?: RuntimePort;
  learning?: LearningPort;
  userId?: string;
  planning: boolean;
  subagents: boolean;
  subagentConfig?: Partial<SubagentConfig>;
  approvalConfig?: Required<ApprovalConfig>;
  checkpointConfig?: Required<CheckpointConfig>;
  extraTools?: Record<string, Tool>;
  plugins?: Plugin[];
  costTracker?: CostTrackerPort;
  circuitBreaker?: CircuitBreaker;
  rateLimiter?: RateLimiter;
  toolCache?: ToolCache;
  lifecycleHooks?: LifecycleHooks;
  telemetry?: TelemetryPort;
  /** AI SDK Output specification for structured output (passthrough to ToolLoopAgent). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
  /** Middleware stack — composable, priority-ordered hooks */
  middleware?: MiddlewarePort[];
}

export class Agent {
  readonly sessionId: string;
  readonly eventBus: EventBus;

  private readonly config: AgentInternalConfig;
  private _runtime: RuntimePort | null;
  private _runtimePromise: Promise<RuntimePort> | null = null;
  private readonly tokenTracker: TokenTracker;
  private readonly pluginManager: PluginManager;
  private readonly middlewareChain: MiddlewareChain;
  private _toolManager?: ToolManager;
  private _executionEngine?: ExecutionEngine;
  private readonly lifecycleManager: LifecycleManager;
  
  // Resilience patterns
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly rateLimiter?: RateLimiter;
  private readonly toolCache?: ToolCache;
  
  // Telemetry
  private readonly telemetry?: TelemetryPort;

  constructor(config: AgentInternalConfig) {
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
    
    // Initialize middleware chain
    this.middlewareChain = new MiddlewareChain();
    for (const mw of config.middleware ?? []) {
      this.middlewareChain.use(mw);
    }
    
    // Initialize resilience patterns
    this.circuitBreaker = config.circuitBreaker;
    this.rateLimiter = config.rateLimiter;
    this.toolCache = config.toolCache;
    
    // Initialize telemetry
    this.telemetry = config.telemetry;

    // Initialize lifecycle manager
    this.lifecycleManager = new LifecycleManager(config.lifecycleHooks ?? {});
  }

  // ---------------------------------------------------------------------------
  // Lazy-initialized heavy managers (created on first access)
  // ---------------------------------------------------------------------------

  private get toolManager(): ToolManager {
    return this._toolManager ??= new ToolManager(
      {
        model: this.config.model,
        instructions: this.config.instructions,
        name: this.config.name,
        maxSteps: this.config.maxSteps,
        fs: this.config.fs,
        memory: this.config.memory,
        learning: this.config.learning,
        mcp: this.config.mcp,
        policyEngine: this.config.policyEngine,
        userId: this.config.userId,
        planning: this.config.planning,
        subagents: this.config.subagents,
        subagentConfig: this.config.subagentConfig,
        approvalConfig: this.config.approvalConfig,
        extraTools: this.config.extraTools,
      },
      this.pluginManager,
      this.circuitBreaker,
      this.rateLimiter,
      this.toolCache,
    );
  }

  private get executionEngine(): ExecutionEngine {
    return this._executionEngine ??= new ExecutionEngine(
      {
        model: this.config.model,
        instructions: this.config.instructions,
        maxSteps: this.config.maxSteps,
        memory: this.config.memory,
        learning: this.config.learning,
        userId: this.config.userId,
        agentName: this.config.name,
        delegationHooks: this.config.subagentConfig?.hooks,
        checkpointConfig: this.config.checkpointConfig,
        telemetry: this.config.telemetry,
        costTracker: this.config.costTracker,
        output: this.config.output,
      },
      this.toolManager,
      this.pluginManager,
      this.eventBus,
      this.tokenTracker,
      this.middlewareChain,
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

  static create(config: AgentConfig): AgentBuilder {
    return new AgentBuilder(config);
  }

  static minimal(config: AgentConfig): Agent {
    return Agent.create(config).withPlanning().build();
  }

  static full(config: AgentConfig & {
    memory?: MemoryPort;
    mcp?: McpPort;
    tokenCounter?: TokenCounterPort;
  }): Agent {
    const builder = Agent.create(config).withPlanning().withSubagents();
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
   * use `Agent.create()` and compose manually.
   */
  static auto(config: AgentConfig): Agent {
    return Agent.create(config).withPlanning().build();
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

  async run(prompt: string, options: AgentRunOptions = {}): Promise<AgentResult> {
    await this.ensureRuntime();
    return this.executionEngine.run(prompt, this.sessionId, this._runtime!, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async stream(
    params: { messages: Array<{ role: string; content: unknown }> },
    options: AgentRunOptions = {},
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
      await this.config.telemetry?.flush();
    } catch {
      // Continue with cleanup even if telemetry flush fails
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