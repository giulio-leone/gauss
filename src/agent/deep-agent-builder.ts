// =============================================================================
// DeepAgentBuilder — Configuration & construction of DeepAgent instances
// =============================================================================

import type { Tool } from "ai";

import type { FilesystemPort } from "../ports/filesystem.port.js";
import type { MemoryPort } from "../ports/memory.port.js";
import type { LearningPort } from "../ports/learning.port.js";
import type { TokenCounterPort } from "../ports/token-counter.port.js";
import type { McpPort } from "../ports/mcp.port.js";
import type { AgentEventHandler, AgentEventType, DeepAgentConfig, ApprovalConfig, SubagentConfig } from "../types.js";
import type { DeepAgentPlugin } from "../ports/plugin.port.js";
import type { RuntimePort } from "../ports/runtime.port.js";
import type { LifecycleHooks } from "./lifecycle.js";
import type { PromptTemplate } from "../templates/index.js";

import { AbstractBuilder } from "../utils/abstract-builder.js";
import { resolveApprovalConfig, resolveCheckpointConfig } from "./agent-config.js";
import { defaultFilesystem, defaultMemory, defaultTokenCounter } from "./defaults.js";
import { CircuitBreaker, RateLimiter, ToolCache, DEFAULT_CIRCUIT_BREAKER_CONFIG, DEFAULT_RATE_LIMITER_CONFIG, DEFAULT_TOOL_CACHE_CONFIG } from "../adapters/resilience/index.js";
import type { CircuitBreakerConfig, RateLimiterConfig, ToolCacheConfig } from "../adapters/resilience/index.js";

import { DeepAgent } from "./deep-agent.js";

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
  private lifecycleHooks?: LifecycleHooks;

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

  withLifecycle(hooks: LifecycleHooks): this {
    this.lifecycleHooks = hooks;
    return this;
  }

  withInstructions(instructions: string): this;
  withInstructions(template: PromptTemplate, variables?: Record<string, string>): this;
  withInstructions(instructionsOrTemplate: string | PromptTemplate, variables?: Record<string, string>): this {
    if (typeof instructionsOrTemplate === 'string') {
      this.agentConfig.instructions = instructionsOrTemplate;
    } else {
      this.agentConfig.instructions = instructionsOrTemplate.compile(variables);
    }
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
      fs: this.fs ?? defaultFilesystem(),
      memory: this.memory ?? defaultMemory(),
      learning: this.learning,
      userId: this.userId,
      tokenCounter: this.tokenCounter ?? defaultTokenCounter(),
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
      lifecycleHooks: this.lifecycleHooks,
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
