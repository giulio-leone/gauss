// =============================================================================
// DatadogTelemetryAdapter — Wraps dd-trace for Datadog APM tracing (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

/**
 * Configuration for initialising the Datadog tracer internally.
 */
export interface DatadogConfig {
  apiKey: string;
  service: string;
  env: string;
  version?: string;
  hostname?: string;
}

/**
 * Adapter that maps TelemetryPort spans to Datadog APM traces and metrics to
 * Datadog custom metrics. Requires `dd-trace` as a peer dependency.
 *
 * Accepts either a pre-configured dd-trace tracer instance or config to init one.
 *
 * Usage (with config):
 * ```ts
 * const adapter = new DatadogTelemetryAdapter({
 *   config: { apiKey: "dd-…", service: "my-agent", env: "production" },
 * });
 * ```
 *
 * Usage (with existing tracer):
 * ```ts
 * import tracer from "dd-trace";
 * tracer.init({ service: "my-agent", env: "production" });
 * const adapter = new DatadogTelemetryAdapter({ tracer });
 * ```
 */
export class DatadogTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tracerPromise: Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dogstatsdPromise: Promise<any> | undefined;

  constructor(options: { tracer?: unknown; config?: DatadogConfig }) {
    if (options.tracer) {
      this.tracerPromise = Promise.resolve(options.tracer);
    } else if (options.config) {
      const cfg = options.config;
      // @ts-expect-error — dd-trace is a peer dependency resolved at runtime
      this.tracerPromise = import("dd-trace").then((mod) => {
        const ddTrace = mod.default ?? mod;
        return ddTrace.init({
          service: cfg.service,
          env: cfg.env,
          ...(cfg.version ? { version: cfg.version } : {}),
          ...(cfg.hostname ? { hostname: cfg.hostname } : {}),
        });
      });
    } else {
      throw new Error("DatadogTelemetryAdapter requires either a tracer or config");
    }

    // Initialise DogStatsD client for custom metrics when using config
    if (options.config) {
      // @ts-expect-error — dd-trace is a peer dependency resolved at runtime
      this.dogstatsdPromise = import("dd-trace").then((mod) => {
        const ddTrace = mod.default ?? mod;
        return ddTrace.dogstatsd;
      });
    }
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    return new DatadogSpan(this.tracerPromise, name, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    if (this.dogstatsdPromise) {
      void this.dogstatsdPromise.then((dogstatsd) => {
        if (dogstatsd) {
          const tags = attributes
            ? Object.entries(attributes).map(([k, v]) => `${k}:${v}`)
            : [];
          dogstatsd.gauge(name, value, tags);
        }
      });
    } else {
      // When using a pre-configured tracer, attempt to use its dogstatsd
      void this.tracerPromise.then((tracer) => {
        if (tracer.dogstatsd) {
          const tags = attributes
            ? Object.entries(attributes).map(([k, v]) => `${k}:${v}`)
            : [];
          tracer.dogstatsd.gauge(name, value, tags);
        }
      });
    }
  }

  async flush(): Promise<void> {
    const tracer = await this.tracerPromise;
    // dd-trace auto-flushes — but we can force-flush if the method exists
    if (typeof tracer.flush === "function") {
      await new Promise<void>((resolve) => tracer.flush(resolve));
    }
  }
}

class DatadogSpan implements TelemetrySpan {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private spanPromise: Promise<any>;
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tracerPromise: Promise<any>,
    private readonly name: string,
    private readonly attributes?: Record<string, string | number | boolean>,
  ) {
    this.spanPromise = tracerPromise.then((tracer) => {
      const span = tracer.startSpan(name);
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          span.setTag(key, value);
        }
      }
      return span;
    });
  }

  setAttribute(key: string, value: string | number | boolean): void {
    void this.spanPromise.then((span) => {
      span.setTag(key, value);
    });
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    void this.spanPromise.then((span) => {
      if (this.statusCode === "ERROR") {
        span.setTag("error", true);
        if (this.statusMessage) {
          span.setTag("error.message", this.statusMessage);
        }
      }
      span.finish();
    });
  }
}
