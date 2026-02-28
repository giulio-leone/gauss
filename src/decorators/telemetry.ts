// =============================================================================
// Telemetry Decorator — Spans and metrics for agent execution
// =============================================================================

import type { Decorator, RunContext, AgentResult } from "../core/agent/types.js";

export interface TelemetrySpan {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: "ok" | "error", message?: string): void;
  end(): void;
}

export interface TelemetryPort {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan;
  recordMetric(name: string, value: number, attributes?: Record<string, string>): void;
  flush(): Promise<void>;
}

export interface TelemetryDecoratorConfig {
  provider: TelemetryPort;
  spanPrefix?: string;
}

export function telemetry(config: TelemetryDecoratorConfig): Decorator {
  const { provider, spanPrefix = "agent" } = config;

  return {
    name: "telemetry",

    async beforeRun(ctx: RunContext) {
      const span = provider.startSpan(`${spanPrefix}.run`, {
        "agent.name": ctx.config.name ?? "unnamed",
        "agent.prompt.length": ctx.prompt.length,
      });
      ctx.metadata["_telemetrySpan"] = span;
      ctx.metadata["_telemetryStartTime"] = performance.now();
      return ctx;
    },

    async afterRun(ctx: RunContext, result: AgentResult) {
      const span = ctx.metadata["_telemetrySpan"] as TelemetrySpan | undefined;
      const startTime = ctx.metadata["_telemetryStartTime"] as number | undefined;

      if (span) {
        span.setAttribute("agent.steps", result.steps.length);
        span.setAttribute("agent.tokens.input", result.usage.inputTokens);
        span.setAttribute("agent.tokens.output", result.usage.outputTokens);
        span.setAttribute("agent.finish_reason", result.finishReason);
        span.setStatus("ok");
        span.end();
      }

      if (startTime) {
        provider.recordMetric(`${spanPrefix}.duration_ms`, performance.now() - startTime);
      }

      provider.recordMetric(`${spanPrefix}.tokens.input`, result.usage.inputTokens);
      provider.recordMetric(`${spanPrefix}.tokens.output`, result.usage.outputTokens);
      provider.recordMetric(`${spanPrefix}.steps`, result.steps.length);

      return result;
    },

    async onError(error: Error, ctx: RunContext) {
      const span = ctx.metadata["_telemetrySpan"] as TelemetrySpan | undefined;
      if (span) {
        span.setStatus("error", error.message);
        span.end();
      }
    },

    async destroy() {
      await provider.flush();
    },
  };
}
