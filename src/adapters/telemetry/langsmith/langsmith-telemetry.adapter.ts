// =============================================================================
// LangSmithTelemetryAdapter — Wraps LangSmith SDK for LLM tracing (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

/**
 * Configuration for creating a LangSmith client internally.
 */
export interface LangSmithConfig {
  apiKey: string;
  endpoint?: string;
}

/**
 * Adapter that maps TelemetryPort spans to LangSmith runs and metrics to
 * LangSmith feedback. Requires `langsmith` as a peer dependency.
 *
 * Accepts either a pre-configured LangSmith Client or config to create one.
 *
 * Usage (with config):
 * ```ts
 * const adapter = new LangSmithTelemetryAdapter({
 *   config: { apiKey: "ls-…", endpoint: "https://api.smith.langchain.com" },
 * });
 * ```
 *
 * Usage (with existing client):
 * ```ts
 * import { Client } from "langsmith";
 * const client = new Client({ apiKey: "ls-…" });
 * const adapter = new LangSmithTelemetryAdapter({ client });
 * ```
 */
export class LangSmithTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any>;

  constructor(options: { client?: unknown; config?: LangSmithConfig }) {
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    } else if (options.config) {
      const cfg = options.config;
      // @ts-expect-error — langsmith is a peer dependency resolved at runtime
      this.clientPromise = import("langsmith").then(({ Client }) => {
        return new Client({
          apiKey: cfg.apiKey,
          ...(cfg.endpoint ? { apiUrl: cfg.endpoint } : {}),
        });
      });
    } else {
      throw new Error("LangSmithTelemetryAdapter requires either a client or config");
    }
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    return new LangSmithSpan(this.clientPromise, name, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    void this.clientPromise.then((client) => {
      // Map metrics to LangSmith feedback on a synthetic run
      client.createFeedback(undefined, name, {
        score: value,
        comment: attributes ? JSON.stringify(attributes) : undefined,
      }).catch(() => {
        // Feedback without a run ID may not be supported — silently ignore
      });
    });
  }

  async flush(): Promise<void> {
    // LangSmith client uses HTTP requests per call — no batch buffer to flush
    await this.clientPromise;
  }
}

class LangSmithSpan implements TelemetrySpan {
  private readonly runId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly clientPromise: Promise<any>;
  private readonly startTime = new Date();
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;
  private readonly extraAttributes: Record<string, string | number | boolean> = {};

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientPromise: Promise<any>,
    private readonly name: string,
    private readonly attributes?: Record<string, string | number | boolean>,
  ) {
    this.runId = crypto.randomUUID();
    this.clientPromise = clientPromise;

    // Create the run asynchronously
    void clientPromise.then((client) => {
      client.createRun({
        id: this.runId,
        name,
        run_type: "chain",
        inputs: attributes ?? {},
        start_time: this.startTime.toISOString(),
      });
    });
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.extraAttributes[key] = value;
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    void this.clientPromise.then((client) => {
      client.updateRun(this.runId, {
        end_time: new Date().toISOString(),
        outputs: {
          ...this.extraAttributes,
          status: this.statusCode,
          ...(this.statusMessage ? { statusMessage: this.statusMessage } : {}),
        },
        error: this.statusCode === "ERROR" ? this.statusMessage : undefined,
      });
    });
  }
}
