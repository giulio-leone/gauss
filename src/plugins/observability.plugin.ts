// =============================================================================
// ObservabilityPlugin — Tracing, metrics, and cost estimation for DeepAgents
// =============================================================================

import { BasePlugin } from "./base.plugin.js";
import type { 
  PluginContext, 
  PluginHooks, 
  BeforeRunParams, 
  BeforeRunResult,
  AfterRunParams,
  BeforeToolParams,
  BeforeToolResult,
  AfterToolParams,
  OnErrorParams,
  OnErrorResult
} from "../ports/plugin.port.js";

export interface ObservabilityConfig {
  enableTracing?: boolean;
  enableMetrics?: boolean;
  enableCostEstimation?: boolean;
  costPerInputToken?: number;
  costPerOutputToken?: number;
  maxSpans?: number; // Max spans to retain (oldest evicted). Default: 10000
}

export interface Span {
  id: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  parentId?: string;
  status: 'ok' | 'error';
  children: Span[];
}

export interface AgentMetrics {
  totalTokens: { input: number; output: number };
  totalLatencyMs: number;
  toolCalls: { name: string; latencyMs: number; success: boolean }[];
  llmCalls: { latencyMs: number; inputTokens: number; outputTokens: number }[];
  estimatedCostUsd?: number;
}

export class ObservabilityPlugin extends BasePlugin {
  readonly name = "observability";
  readonly version = "1.0.0";

  private config: ObservabilityConfig;
  private spans: Map<string, Span> = new Map();
  private rootSpans: Span[] = [];
  private activeSpans: Map<string, Span> = new Map(); // sessionId → current root span
  private sessionMetrics: Map<string, AgentMetrics> = new Map(); // sessionId → metrics
  private sessionStartTimes: Map<string, number> = new Map(); // sessionId → run start time
  private toolStartTimes = new Map<string, number[]>(); // sessionId:toolName → start time stack (LIFO)
  private readonly toolSpanStack = new Map<string, string[]>(); // sessionId:toolName → spanId stack (LIFO)
  private readonly maxSpans: number;

  constructor(config: ObservabilityConfig = {}) {
    super();
    this.config = {
      enableTracing: true,
      enableMetrics: true,
      enableCostEstimation: false,
      ...config
    };
    this.maxSpans = config.maxSpans ?? 10000;
  }

  protected buildHooks(): PluginHooks {
    return {
      beforeRun: this.onRequest.bind(this),
      afterRun: this.onResponse.bind(this),
      beforeTool: this.onToolStart.bind(this),
      afterTool: this.onToolEnd.bind(this),
      onError: this.onError.bind(this)
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private createSpan(name: string, traceId: string, parentId?: string): Span {
    // Evict oldest spans if at capacity
    if (this.spans.size >= this.maxSpans) {
      const oldestKey = this.spans.keys().next().value;
      if (oldestKey) {
        const oldSpan = this.spans.get(oldestKey);
        this.spans.delete(oldestKey);
        // Remove from rootSpans if it was a root
        if (oldSpan && !oldSpan.parentId) {
          const idx = this.rootSpans.indexOf(oldSpan);
          if (idx >= 0) this.rootSpans.splice(idx, 1);
        }
      }
    }

    const span: Span = {
      id: this.generateId(),
      traceId,
      name,
      startTime: Date.now(),
      attributes: {},
      parentId,
      status: 'ok',
      children: []
    };

    this.spans.set(span.id, span);

    if (parentId) {
      const parent = this.spans.get(parentId);
      if (parent) {
        parent.children.push(span);
      }
    } else {
      this.rootSpans.push(span);
    }

    return span;
  }

  private endSpan(spanId: string, status: 'ok' | 'error' = 'ok'): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.endTime = Date.now();
      span.status = status;
    }
  }

  private getOrCreateMetrics(sessionId: string): AgentMetrics {
    let metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) {
      metrics = {
        totalTokens: { input: 0, output: 0 },
        totalLatencyMs: 0,
        toolCalls: [],
        llmCalls: []
      };
      this.sessionMetrics.set(sessionId, metrics);
    }
    return metrics;
  }

  private async onRequest(ctx: PluginContext, params: BeforeRunParams): Promise<BeforeRunResult | void> {
    if (!this.config.enableTracing && !this.config.enableMetrics) {
      return;
    }

    const sessionId = ctx.sessionId;

    if (this.config.enableTracing) {
      const traceId = this.generateId();
      const span = this.createSpan('agent.run', traceId);
      span.attributes = {
        sessionId,
        agentName: ctx.agentName,
        prompt: params.prompt,
        maxSteps: ctx.config.maxSteps
      };
      this.activeSpans.set(sessionId, span);
    }

    if (this.config.enableMetrics) {
      this.sessionStartTimes.set(sessionId, Date.now());
      this.sessionMetrics.set(sessionId, {
        totalTokens: { input: 0, output: 0 },
        totalLatencyMs: 0,
        toolCalls: [],
        llmCalls: []
      });
    }
  }

  private async onResponse(ctx: PluginContext, params: AfterRunParams): Promise<void> {
    if (!this.config.enableTracing && !this.config.enableMetrics) {
      return;
    }

    const sessionId = ctx.sessionId;
    const rootSpan = this.activeSpans.get(sessionId);

    if (this.config.enableTracing && rootSpan) {
      this.endSpan(rootSpan.id);
      rootSpan.attributes.result = params.result.text;
      rootSpan.attributes.steps = params.result.steps?.length || 0;
    }

    if (this.config.enableMetrics) {
      const metrics = this.getOrCreateMetrics(sessionId);
      const startTime = this.sessionStartTimes.get(sessionId);
      if (startTime) {
        metrics.totalLatencyMs = Date.now() - startTime;
      }
      
      if (this.config.enableCostEstimation && this.config.costPerInputToken && this.config.costPerOutputToken) {
        metrics.estimatedCostUsd = 
          (metrics.totalTokens.input * this.config.costPerInputToken) +
          (metrics.totalTokens.output * this.config.costPerOutputToken);
      }

      this.sessionStartTimes.delete(sessionId);
    }

    this.activeSpans.delete(sessionId);
  }

  private async onToolStart(ctx: PluginContext, params: BeforeToolParams): Promise<BeforeToolResult | void> {
    if (!this.config.enableTracing && !this.config.enableMetrics) {
      return;
    }

    if (this.config.enableMetrics) {
      const metricsKey = `${ctx.sessionId}:${params.toolName}`;
      const stack = this.toolStartTimes.get(metricsKey) ?? [];
      stack.push(Date.now());
      this.toolStartTimes.set(metricsKey, stack);
    }

    if (this.config.enableTracing) {
      const rootSpan = this.activeSpans.get(ctx.sessionId);
      const traceId = rootSpan?.traceId ?? this.generateId();
      const toolSpan = this.createSpan(`tool.${params.toolName}`, traceId, rootSpan?.id);
      toolSpan.attributes = {
        toolName: params.toolName,
        args: params.args
      };
      const stackKey = `${ctx.sessionId}:${params.toolName}`;
      const stack = this.toolSpanStack.get(stackKey) ?? [];
      stack.push(toolSpan.id);
      this.toolSpanStack.set(stackKey, stack);
    }
  }

  private async onToolEnd(ctx: PluginContext, params: AfterToolParams): Promise<void> {
    if (!this.config.enableTracing && !this.config.enableMetrics) {
      return;
    }

    if (this.config.enableTracing) {
      const spanKey = `${ctx.sessionId}:${params.toolName}`;
      const stack = this.toolSpanStack.get(spanKey);
      const spanId = stack?.pop();
      if (spanId) {
        const toolSpan = this.spans.get(spanId);
        if (toolSpan) {
          this.endSpan(toolSpan.id);
          toolSpan.attributes.result = params.result;
        }
        if (stack && stack.length === 0) {
          this.toolSpanStack.delete(spanKey);
        }
      }
    }

    if (this.config.enableMetrics) {
      const key = `${ctx.sessionId}:${params.toolName}`;
      const stack = this.toolStartTimes.get(key);
      const startTime = stack?.pop();
      const latencyMs = startTime ? Date.now() - startTime : 0;
      if (stack && stack.length === 0) {
        this.toolStartTimes.delete(key);
      }

      const metrics = this.getOrCreateMetrics(ctx.sessionId);
      metrics.toolCalls.push({
        name: params.toolName,
        latencyMs,
        success: true
      });
    }
  }

  private async onError(ctx: PluginContext, params: OnErrorParams): Promise<OnErrorResult | void> {
    if (!this.config.enableTracing) {
      return;
    }

    const rootSpan = this.activeSpans.get(ctx.sessionId);
    const unfinishedSpans = Array.from(this.spans.values())
      .filter(s => !s.endTime && s.traceId === rootSpan?.traceId)
      .sort((a, b) => b.startTime - a.startTime);

    if (unfinishedSpans.length > 0) {
      const span = unfinishedSpans[0];
      this.endSpan(span.id, 'error');
      span.attributes.error = {
        message: params.error instanceof Error ? params.error.message : String(params.error),
        phase: params.phase
      };
    }
  }

  // Public methods
  public getTraces(): Span[] {
    return this.config.enableTracing ? [...this.rootSpans] : [];
  }

  public getMetrics(sessionId?: string): AgentMetrics {
    if (!this.config.enableMetrics) {
      return {
        totalTokens: { input: 0, output: 0 },
        totalLatencyMs: 0,
        toolCalls: [],
        llmCalls: []
      };
    }
    if (sessionId) {
      const m = this.sessionMetrics.get(sessionId);
      return m ? this.deepCopyMetrics(m) : {
        totalTokens: { input: 0, output: 0 },
        totalLatencyMs: 0,
        toolCalls: [],
        llmCalls: []
      };
    }
    // Return last session's metrics for backward compat
    const entries = Array.from(this.sessionMetrics.values());
    const last = entries[entries.length - 1];
    return last ? this.deepCopyMetrics(last) : {
      totalTokens: { input: 0, output: 0 },
      totalLatencyMs: 0,
      toolCalls: [],
      llmCalls: []
    };
  }

  private deepCopyMetrics(m: AgentMetrics): AgentMetrics {
    return {
      totalTokens: { ...m.totalTokens },
      totalLatencyMs: m.totalLatencyMs,
      toolCalls: m.toolCalls.map(t => ({ ...t })),
      llmCalls: m.llmCalls.map(l => ({ ...l })),
      estimatedCostUsd: m.estimatedCostUsd
    };
  }

  public exportOpenTelemetry(): object {
    if (!this.config.enableTracing) {
      return { resourceSpans: [] };
    }

    const spans = Array.from(this.spans.values()).map(span => ({
      traceId: span.traceId,
      spanId: span.id,
      parentSpanId: span.parentId,
      name: span.name,
      startTimeUnixNano: span.startTime * 1_000_000,
      endTimeUnixNano: span.endTime ? span.endTime * 1_000_000 : undefined,
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: { stringValue: String(value) }
      })),
      status: {
        code: span.status === 'ok' ? 1 : 2
      }
    }));

    return {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'deepagent' } },
            { key: 'service.version', value: { stringValue: this.version } }
          ]
        },
        scopeSpans: [{
          scope: {
            name: 'deepagent-observability',
            version: this.version
          },
          spans
        }]
      }]
    };
  }

  public reset(): void {
    this.spans.clear();
    this.rootSpans = [];
    this.activeSpans.clear();
    this.sessionMetrics.clear();
    this.sessionStartTimes.clear();
    this.toolStartTimes.clear();
    this.toolSpanStack.clear();
  }
}

/** @deprecated Use `ObservabilityConfig` instead */
export type ObservabilityPluginConfig = ObservabilityConfig;

/** @deprecated Use `new ObservabilityPlugin(config)` instead */
export function createObservabilityPlugin(config?: ObservabilityConfig): ObservabilityPlugin {
  return new ObservabilityPlugin(config);
}
