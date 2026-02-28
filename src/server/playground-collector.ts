// =============================================================================
// PlaygroundCollector — Automatic data collection for Playground dashboards
// =============================================================================
//
// Wraps an Agent and automatically collects traces, token usage, tool calls,
// and reliability metrics for the playground UI.
//
// Usage:
//   import { PlaygroundCollector } from 'gauss'
//   const collector = new PlaygroundCollector(myAgent)
//   // Register collector.asPlaygroundAgent() with the playground
//
// =============================================================================

import type {
  PlaygroundAgent,
  PlaygroundTraceSpan,
  PlaygroundTokenUsage,
  PlaygroundToolCall,
  PlaygroundReliabilityMetrics,
  PlaygroundMemoryEntry,
  PlaygroundGraphData,
  PlaygroundTool,
} from "./playground-api.js";

export interface PlaygroundCollectorOptions {
  /** Maximum number of traces to keep (default: 1000) */
  maxTraces?: number;
  /** Maximum number of token records to keep (default: 1000) */
  maxTokenRecords?: number;
  /** Maximum number of tool calls to keep (default: 5000) */
  maxToolCalls?: number;
}

export class PlaygroundCollector {
  private traces: PlaygroundTraceSpan[] = [];
  private tokenUsage: PlaygroundTokenUsage[] = [];
  private toolCalls: PlaygroundToolCall[] = [];
  private reliabilityMetrics: PlaygroundReliabilityMetrics = {
    circuitBreaker: { state: "closed", failureCount: 0, successCount: 0, lastStateChange: Date.now() },
    retries: { totalAttempts: 0, successfulRetries: 0, failedRetries: 0, recentRetries: [] },
    rateLimiter: { remainingTokens: 0, maxTokens: 0, requestsThisWindow: 0 },
  };
  private readonly maxTraces: number;
  private readonly maxTokenRecords: number;
  private readonly maxToolCalls: number;

  constructor(options?: PlaygroundCollectorOptions) {
    this.maxTraces = options?.maxTraces ?? 1000;
    this.maxTokenRecords = options?.maxTokenRecords ?? 1000;
    this.maxToolCalls = options?.maxToolCalls ?? 5000;
  }

  // ─── Recording API ──────────────────────────────────────────────────────

  /** Record a trace span (execution step) */
  recordTrace(span: PlaygroundTraceSpan): void {
    this.traces.push(span);
    if (this.traces.length > this.maxTraces) {
      this.traces = this.traces.slice(-this.maxTraces);
    }
  }

  /** Record token usage for a run */
  recordTokenUsage(usage: PlaygroundTokenUsage): void {
    this.tokenUsage.push(usage);
    if (this.tokenUsage.length > this.maxTokenRecords) {
      this.tokenUsage = this.tokenUsage.slice(-this.maxTokenRecords);
    }
  }

  /** Record a tool call with input/output */
  recordToolCall(call: PlaygroundToolCall): void {
    this.toolCalls.push(call);
    if (this.toolCalls.length > this.maxToolCalls) {
      this.toolCalls = this.toolCalls.slice(-this.maxToolCalls);
    }
  }

  /** Update circuit breaker state */
  updateCircuitBreaker(state: PlaygroundReliabilityMetrics["circuitBreaker"]): void {
    this.reliabilityMetrics.circuitBreaker = state;
  }

  /** Record a retry event */
  recordRetry(retry: PlaygroundReliabilityMetrics["retries"]["recentRetries"][0]): void {
    this.reliabilityMetrics.retries.totalAttempts++;
    if (retry.success) this.reliabilityMetrics.retries.successfulRetries++;
    else this.reliabilityMetrics.retries.failedRetries++;
    this.reliabilityMetrics.retries.recentRetries.push(retry);
    // Keep last 100 retries
    if (this.reliabilityMetrics.retries.recentRetries.length > 100) {
      this.reliabilityMetrics.retries.recentRetries =
        this.reliabilityMetrics.retries.recentRetries.slice(-100);
    }
  }

  /** Update rate limiter state */
  updateRateLimiter(state: PlaygroundReliabilityMetrics["rateLimiter"]): void {
    this.reliabilityMetrics.rateLimiter = state;
  }

  // ─── Query API ──────────────────────────────────────────────────────────

  getTraces(): PlaygroundTraceSpan[] {
    return [...this.traces];
  }

  getTokenUsage(): PlaygroundTokenUsage[] {
    return [...this.tokenUsage];
  }

  getToolCalls(): PlaygroundToolCall[] {
    return [...this.toolCalls];
  }

  getReliabilityMetrics(): PlaygroundReliabilityMetrics {
    return { ...this.reliabilityMetrics };
  }

  /** Clear all collected data */
  clear(): void {
    this.traces = [];
    this.tokenUsage = [];
    this.toolCalls = [];
    this.reliabilityMetrics = {
      circuitBreaker: { state: "closed", failureCount: 0, successCount: 0, lastStateChange: Date.now() },
      retries: { totalAttempts: 0, successfulRetries: 0, failedRetries: 0, recentRetries: [] },
      rateLimiter: { remainingTokens: 0, maxTokens: 0, requestsThisWindow: 0 },
    };
  }

  // ─── PlaygroundAgent Factory ────────────────────────────────────────────

  /**
   * Create a PlaygroundAgent configuration with automatic data collection hooks.
   *
   * @example
   * ```ts
   * const collector = new PlaygroundCollector()
   * const playgroundAgent = collector.asPlaygroundAgent({
   *   name: 'my-agent',
   *   invoke: (prompt) => myAgent.run(prompt),
   * })
   * ```
   */
  asPlaygroundAgent(base: {
    name: string;
    description?: string;
    invoke: PlaygroundAgent["invoke"];
    tools?: PlaygroundTool[];
    getMemory?: () => Promise<PlaygroundMemoryEntry[]>;
    getGraph?: () => Promise<PlaygroundGraphData>;
  }): PlaygroundAgent {
    return {
      ...base,
      getTraces: async () => this.getTraces(),
      getTokenUsage: async () => this.getTokenUsage(),
      getToolCalls: async () => this.getToolCalls(),
      getReliabilityMetrics: async () => this.getReliabilityMetrics(),
    };
  }
}
