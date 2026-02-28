// =============================================================================
// SentryTelemetryAdapter — Wraps @sentry/node for error & perf tracing (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

/**
 * Configuration for initialising Sentry internally.
 */
export interface SentryConfig {
  dsn: string;
  tracesSampleRate?: number;
  environment?: string;
  release?: string;
}

/**
 * Adapter that maps TelemetryPort spans to Sentry transactions/spans and
 * errors to Sentry events. Requires `@sentry/node` as a peer dependency.
 *
 * Accepts either a pre-initialised Sentry namespace or config to call `init()`.
 *
 * Usage (with config):
 * ```ts
 * const adapter = new SentryTelemetryAdapter({
 *   config: { dsn: "https://…@sentry.io/…", tracesSampleRate: 1.0 },
 * });
 * ```
 *
 * Usage (with existing Sentry instance):
 * ```ts
 * import * as Sentry from "@sentry/node";
 * Sentry.init({ dsn: "https://…@sentry.io/…" });
 * const adapter = new SentryTelemetryAdapter({ sentry: Sentry });
 * ```
 */
export class SentryTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sentryPromise: Promise<any>;

  constructor(options: { sentry?: unknown; config?: SentryConfig }) {
    if (options.sentry) {
      this.sentryPromise = Promise.resolve(options.sentry);
    } else if (options.config) {
      const cfg = options.config;
      // @ts-expect-error — @sentry/node is a peer dependency resolved at runtime
      this.sentryPromise = import("@sentry/node").then((Sentry) => {
        Sentry.init({
          dsn: cfg.dsn,
          tracesSampleRate: cfg.tracesSampleRate ?? 1.0,
          ...(cfg.environment ? { environment: cfg.environment } : {}),
          ...(cfg.release ? { release: cfg.release } : {}),
        });
        return Sentry;
      });
    } else {
      throw new Error("SentryTelemetryAdapter requires either a sentry instance or config");
    }
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    return new SentrySpan(this.sentryPromise, name, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    void this.sentryPromise.then((Sentry) => {
      // Use Sentry metrics API (gauge) when available, fallback to breadcrumb
      if (Sentry.metrics?.gauge) {
        Sentry.metrics.gauge(name, value, { tags: attributes });
      } else {
        Sentry.addBreadcrumb({
          category: "metric",
          message: `${name}=${value}`,
          data: attributes,
          level: "info",
        });
      }
    });
  }

  async flush(): Promise<void> {
    const Sentry = await this.sentryPromise;
    await Sentry.flush(5000);
  }
}

class SentrySpan implements TelemetrySpan {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sentryPromise: Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private spanPromise: Promise<any>;
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sentryPromise: Promise<any>,
    private readonly name: string,
    private readonly attributes?: Record<string, string | number | boolean>,
  ) {
    this.sentryPromise = sentryPromise;
    this.spanPromise = sentryPromise.then((Sentry) => {
      return Sentry.startInactiveSpan({
        name,
        op: "telemetry",
        attributes: attributes as Record<string, string | number | boolean | undefined>,
      });
    });
  }

  setAttribute(key: string, value: string | number | boolean): void {
    void this.spanPromise.then((span) => {
      if (span?.setAttribute) {
        span.setAttribute(key, value);
      }
    });
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    void Promise.all([this.sentryPromise, this.spanPromise]).then(([Sentry, span]) => {
      if (this.statusCode === "ERROR") {
        Sentry.captureException(
          new Error(this.statusMessage ?? `Span "${this.name}" ended with ERROR`),
        );
        if (span?.setStatus) {
          span.setStatus({ code: 2, message: this.statusMessage });
        }
      } else {
        if (span?.setStatus) {
          span.setStatus({ code: 1 });
        }
      }
      if (span?.end) {
        span.end();
      }
    });
  }
}
