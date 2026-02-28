// =============================================================================
// LangfuseTelemetryAdapter — Wraps Langfuse SDK for LLM observability (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

/**
 * Configuration for creating a Langfuse client internally.
 */
export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

/**
 * Adapter that maps TelemetryPort spans to Langfuse traces/spans and metrics
 * to Langfuse scores. Requires `langfuse` as a peer dependency.
 *
 * Accepts either a pre-configured Langfuse client or config to create one.
 *
 * Usage (with config):
 * ```ts
 * const adapter = new LangfuseTelemetryAdapter({
 *   config: { publicKey: "pk-…", secretKey: "sk-…", baseUrl: "https://cloud.langfuse.com" },
 * });
 * ```
 *
 * Usage (with existing client):
 * ```ts
 * import { Langfuse } from "langfuse";
 * const client = new Langfuse({ publicKey: "pk-…", secretKey: "sk-…" });
 * const adapter = new LangfuseTelemetryAdapter({ client });
 * ```
 */
export class LangfuseTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any>;

  constructor(options: { client?: unknown; config?: LangfuseConfig }) {
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    } else if (options.config) {
      const cfg = options.config;
      // @ts-expect-error — langfuse is a peer dependency resolved at runtime
      this.clientPromise = import("langfuse").then(({ Langfuse }) => {
        return new Langfuse({
          publicKey: cfg.publicKey,
          secretKey: cfg.secretKey,
          ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
        });
      });
    } else {
      throw new Error("LangfuseTelemetryAdapter requires either a client or config");
    }
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    return new LangfuseSpan(this.clientPromise, name, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    void this.clientPromise.then((client) => {
      // Map metrics to Langfuse scores attached to the default trace
      client.score({
        name,
        value,
        ...(attributes ? { comment: JSON.stringify(attributes) } : {}),
      });
    });
  }

  async flush(): Promise<void> {
    const client = await this.clientPromise;
    await client.flushAsync();
  }
}

class LangfuseSpan implements TelemetrySpan {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tracePromise: Promise<any>;
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
    this.tracePromise = clientPromise.then((client) =>
      client.trace({
        name,
        metadata: attributes ?? {},
      }),
    );
    this.spanPromise = this.tracePromise.then((trace) =>
      trace.span({
        name,
        metadata: attributes ?? {},
        startTime: new Date(),
      }),
    );
  }

  setAttribute(key: string, value: string | number | boolean): void {
    void this.spanPromise.then((span) => {
      span.update({ metadata: { [key]: value } });
    });
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    void this.spanPromise.then((span) => {
      span.update({
        endTime: new Date(),
        level: this.statusCode === "ERROR" ? "ERROR" : "DEFAULT",
        statusMessage: this.statusMessage,
      });
      span.end();
    });
  }
}
