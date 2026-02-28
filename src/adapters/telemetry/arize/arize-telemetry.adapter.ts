// =============================================================================
// ArizeTelemetryAdapter — Wraps Arize SDK for model observability (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

/**
 * Configuration for creating an Arize client internally.
 */
export interface ArizeConfig {
  apiKey: string;
  spaceKey: string;
  modelId?: string;
}

/**
 * Adapter that maps TelemetryPort spans to Arize traces and metrics to model
 * performance scores. Requires `arize` as a peer dependency.
 *
 * Usage (with config):
 * ```ts
 * const adapter = new ArizeTelemetryAdapter({
 *   config: { apiKey: "az-…", spaceKey: "sk-…", modelId: "my-model" },
 * });
 * ```
 *
 * Usage (with existing client):
 * ```ts
 * const adapter = new ArizeTelemetryAdapter({ client: arizeClient });
 * ```
 */
export class ArizeTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any>;
  private readonly modelId: string;

  constructor(options: { client?: unknown; config?: ArizeConfig }) {
    this.modelId = options.config?.modelId ?? "default";

    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    } else if (options.config) {
      const cfg = options.config;
      // @ts-expect-error — arize is a peer dependency resolved at runtime
      this.clientPromise = import("arize").then((mod) => {
        const Arize = mod.Arize ?? mod.default?.Arize ?? mod.default;
        return new Arize({
          apiKey: cfg.apiKey,
          spaceKey: cfg.spaceKey,
        });
      });
    } else {
      throw new Error("ArizeTelemetryAdapter requires either a client or config");
    }
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    return new ArizeSpan(this.clientPromise, name, this.modelId, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    void this.clientPromise.then((client) => {
      client.logScore?.({
        modelId: this.modelId,
        name,
        value,
        ...(attributes ? { tags: attributes } : {}),
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

class ArizeSpan implements TelemetrySpan {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tracePromise: Promise<any>;
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientPromise: Promise<any>,
    private readonly name: string,
    private readonly modelId: string,
    private readonly attributes?: Record<string, string | number | boolean>,
  ) {
    this.tracePromise = clientPromise.then((client) =>
      client.createTrace?.({
        name,
        modelId,
        metadata: attributes ?? {},
        startTime: new Date(),
      }) ?? { id: name },
    );
  }

  setAttribute(key: string, value: string | number | boolean): void {
    void this.tracePromise.then((trace) => {
      if (trace?.setAttribute) {
        trace.setAttribute(key, value);
      }
    });
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    void this.tracePromise.then((trace) => {
      if (trace?.end) {
        trace.end({
          status: this.statusCode,
          statusMessage: this.statusMessage,
          endTime: new Date(),
        });
      }
    });
  }
}
