// =============================================================================
// LaminarTelemetryAdapter — Wraps @lmnr-ai/lmnr SDK for LLM tracing (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

/**
 * Configuration for creating a Laminar client internally.
 */
export interface LaminarConfig {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
}

/**
 * Adapter that maps TelemetryPort spans to Laminar traces and metrics to
 * Laminar evaluations. Requires `@lmnr-ai/lmnr` as a peer dependency.
 *
 * Usage (with config):
 * ```ts
 * const adapter = new LaminarTelemetryAdapter({
 *   config: { apiKey: "lm-…", projectId: "proj-…" },
 * });
 * ```
 *
 * Usage (with existing client):
 * ```ts
 * const adapter = new LaminarTelemetryAdapter({ client: laminarClient });
 * ```
 */
export class LaminarTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any>;

  constructor(options: { client?: unknown; config?: LaminarConfig }) {
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    } else if (options.config) {
      const cfg = options.config;
      // @ts-expect-error — @lmnr-ai/lmnr is a peer dependency resolved at runtime
      this.clientPromise = import("@lmnr-ai/lmnr").then((mod) => {
        const Laminar = mod.Laminar ?? mod.default?.Laminar ?? mod.default;
        Laminar.initialize({
          apiKey: cfg.apiKey,
          projectId: cfg.projectId,
          ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
        });
        return Laminar;
      });
    } else {
      throw new Error("LaminarTelemetryAdapter requires either a client or config");
    }
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    return new LaminarSpan(this.clientPromise, name, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    void this.clientPromise.then((client) => {
      client.evaluate?.({
        name,
        score: value,
        ...(attributes ? { metadata: attributes } : {}),
      });
    });
  }

  async flush(): Promise<void> {
    const client = await this.clientPromise;
    if (typeof client.flush === "function") {
      await client.flush();
    }
  }
}

class LaminarSpan implements TelemetrySpan {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private spanPromise: Promise<any>;
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientPromise: Promise<any>,
    private readonly name: string,
    private readonly attributes?: Record<string, string | number | boolean>,
  ) {
    this.spanPromise = clientPromise.then((client) =>
      client.startSpan?.({
        name,
        metadata: attributes ?? {},
        startTime: new Date(),
      }) ?? { id: name },
    );
  }

  setAttribute(key: string, value: string | number | boolean): void {
    void this.spanPromise.then((span) => {
      if (span?.setAttribute) {
        span.setAttribute(key, value);
      } else if (span?.update) {
        span.update({ metadata: { [key]: value } });
      }
    });
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    void this.spanPromise.then((span) => {
      if (span?.end) {
        span.end({
          status: this.statusCode,
          ...(this.statusMessage ? { statusMessage: this.statusMessage } : {}),
        });
      }
    });
  }
}
