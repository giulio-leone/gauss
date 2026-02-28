// =============================================================================
// PostHogTelemetryAdapter — Wraps posthog-node for product analytics (peer dep)
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

/**
 * Configuration for creating a PostHog client internally.
 */
export interface PostHogConfig {
  apiKey: string;
  host?: string;
}

/**
 * Adapter that maps TelemetryPort spans to PostHog events with duration and
 * metrics to PostHog custom events. Requires `posthog-node` as a peer dependency.
 *
 * Usage (with config):
 * ```ts
 * const adapter = new PostHogTelemetryAdapter({
 *   config: { apiKey: "phc_…", host: "https://app.posthog.com" },
 * });
 * ```
 *
 * Usage (with existing client):
 * ```ts
 * import { PostHog } from "posthog-node";
 * const client = new PostHog("phc_…");
 * const adapter = new PostHogTelemetryAdapter({ client });
 * ```
 */
export class PostHogTelemetryAdapter implements TelemetryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any>;

  constructor(options: { client?: unknown; config?: PostHogConfig }) {
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    } else if (options.config) {
      const cfg = options.config;
      // @ts-expect-error — posthog-node is a peer dependency resolved at runtime
      this.clientPromise = import("posthog-node").then((mod) => {
        const PostHog = mod.PostHog ?? mod.default?.PostHog ?? mod.default;
        return new PostHog(cfg.apiKey, {
          ...(cfg.host ? { host: cfg.host } : {}),
        });
      });
    } else {
      throw new Error("PostHogTelemetryAdapter requires either a client or config");
    }
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan {
    return new PostHogSpan(this.clientPromise, name, attributes);
  }

  recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
    void this.clientPromise.then((client) => {
      client.capture({
        distinctId: "system",
        event: `metric:${name}`,
        properties: {
          value,
          ...(attributes ?? {}),
        },
      });
    });
  }

  async flush(): Promise<void> {
    const client = await this.clientPromise;
    if (typeof client.flush === "function") {
      await client.flush();
    }
    if (typeof client.shutdown === "function") {
      await client.shutdown();
    }
  }
}

class PostHogSpan implements TelemetrySpan {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any>;
  private readonly startTime = Date.now();
  private readonly spanAttributes: Record<string, string | number | boolean> = {};
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientPromise: Promise<any>,
    private readonly name: string,
    attributes?: Record<string, string | number | boolean>,
  ) {
    this.clientPromise = clientPromise;
    if (attributes) {
      Object.assign(this.spanAttributes, attributes);
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.spanAttributes[key] = value;
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    const durationMs = Date.now() - this.startTime;
    void this.clientPromise.then((client) => {
      client.capture({
        distinctId: "system",
        event: `span:${this.name}`,
        properties: {
          ...this.spanAttributes,
          durationMs,
          status: this.statusCode,
          ...(this.statusMessage ? { statusMessage: this.statusMessage } : {}),
        },
      });
    });
  }
}
