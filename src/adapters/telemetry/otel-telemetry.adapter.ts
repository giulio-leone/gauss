// =============================================================================
// OtelTelemetryAdapter — Wraps @opentelemetry/api tracer and meter (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../ports/telemetry.port.js";

/**
 * Adapter that delegates to an OpenTelemetry Tracer and optional Meter.
 * Accepts pre-configured instances via DI — does NOT configure OTel itself.
 *
 * Usage:
 * ```ts
 * import { trace, metrics } from "@opentelemetry/api";
 * const adapter = new OtelTelemetryAdapter(
 *   trace.getTracer("my-agent"),
 *   metrics.getMeter("my-agent"),
 * );
 * ```
 */
export class OtelTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly histograms = new Map<string, any>();

  // Using `any` to avoid hard dependency on @opentelemetry/api types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly tracer: any, private readonly meter?: any) {}

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    const otelSpan = this.tracer.startSpan(name, attributes ? { attributes } : undefined);
    return new OtelSpanWrapper(otelSpan);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    if (!this.meter) return;
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = this.meter.createHistogram(name);
      this.histograms.set(name, histogram);
    }
    histogram.record(value, attributes);
  }

  async flush(): Promise<void> {
    // Flushing is handled by the OTel SDK's configured exporter — not our responsibility
  }
}

class OtelSpanWrapper implements TelemetrySpan {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly span: any) {}

  setAttribute(key: string, value: string | number | boolean): void {
    this.span.setAttribute(key, value);
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    // OTel SpanStatusCode: 0=UNSET, 1=OK, 2=ERROR
    const otelCode = code === "OK" ? 1 : 2;
    this.span.setStatus({ code: otelCode, message });
  }

  end(): void {
    this.span.end();
  }
}
