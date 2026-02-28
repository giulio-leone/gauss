// =============================================================================
// HeliconeTelemetryAdapter — Proxy-based LLM observability via Helicone REST API
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

export interface HeliconeConfig {
  apiKey: string;
  baseUrl?: string;
}

export class HeliconeTelemetryAdapter implements TelemetryPort {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private pending: Promise<unknown>[] = [];

  constructor(options: { config: HeliconeConfig }) {
    if (!options.config?.apiKey) {
      throw new Error("HeliconeTelemetryAdapter requires config.apiKey");
    }
    this.apiKey = options.config.apiKey;
    this.baseUrl = options.config.baseUrl ?? "https://api.helicone.ai";
  }

  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): TelemetrySpan {
    return new HeliconeSpan(this, name, attributes);
  }

  recordMetric(
    name: string,
    value: number,
    attributes?: Record<string, string>,
  ): void {
    const body = {
      type: "metric",
      name,
      value,
      properties: attributes ?? {},
      timestamp: new Date().toISOString(),
    };
    this.pending.push(this.post(body));
  }

  async flush(): Promise<void> {
    await Promise.all(this.pending);
    this.pending = [];
  }

  /** @internal */
  post(body: Record<string, unknown>): Promise<unknown> {
    return fetch(`${this.baseUrl}/v1/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }
}

class HeliconeSpan implements TelemetrySpan {
  private readonly attrs: Record<string, string | number | boolean>;
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;
  private readonly startTime = new Date();

  constructor(
    private readonly adapter: HeliconeTelemetryAdapter,
    private readonly name: string,
    attributes?: Record<string, string | number | boolean>,
  ) {
    this.attrs = { ...(attributes ?? {}) };
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attrs[key] = value;
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    const body = {
      type: "span",
      name: this.name,
      status: this.statusCode,
      statusMessage: this.statusMessage,
      properties: this.attrs,
      startTime: this.startTime.toISOString(),
      endTime: new Date().toISOString(),
    };
    void this.adapter.post(body);
  }
}
