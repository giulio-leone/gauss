// =============================================================================
// BraintrustTelemetryAdapter — Wraps Braintrust SDK for eval logging (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

/**
 * Configuration for creating a Braintrust client internally.
 */
export interface BraintrustConfig {
  apiKey: string;
  projectName: string;
}

/**
 * Adapter that maps TelemetryPort spans to Braintrust experiments/logs and
 * metrics to Braintrust scores. Requires `braintrust` as a peer dependency.
 *
 * Usage (with config):
 * ```ts
 * const adapter = new BraintrustTelemetryAdapter({
 *   config: { apiKey: "bt-…", projectName: "my-project" },
 * });
 * ```
 *
 * Usage (with existing client):
 * ```ts
 * const adapter = new BraintrustTelemetryAdapter({ client: braintrustLogger });
 * ```
 */
export class BraintrustTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any>;

  constructor(options: { client?: unknown; config?: BraintrustConfig }) {
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    } else if (options.config) {
      const cfg = options.config;
      // @ts-expect-error — braintrust is a peer dependency resolved at runtime
      this.clientPromise = import("braintrust").then((mod) => {
        const initLogger = mod.initLogger ?? mod.default?.initLogger;
        if (!initLogger) throw new Error("Unable to resolve initLogger from braintrust");
        return initLogger({
          apiKey: cfg.apiKey,
          projectName: cfg.projectName,
        });
      });
    } else {
      throw new Error("BraintrustTelemetryAdapter requires either a client or config");
    }
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    return new BraintrustSpan(this.clientPromise, name, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    void this.clientPromise.then((client) => {
      client.log?.({
        scores: { [name]: value },
        metadata: attributes ?? {},
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

class BraintrustSpan implements TelemetrySpan {
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
      if (span?.log) {
        span.log({ metadata: { [key]: value } });
      }
    });
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    void this.spanPromise.then((span) => {
      if (span?.log) {
        span.log({
          scores: { status: this.statusCode === "OK" ? 1 : 0 },
          metadata: {
            statusCode: this.statusCode,
            ...(this.statusMessage ? { statusMessage: this.statusMessage } : {}),
          },
        });
      }
      if (span?.end) {
        span.end();
      }
    });
  }
}
