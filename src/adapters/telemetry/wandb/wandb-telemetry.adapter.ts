// =============================================================================
// WandbTelemetryAdapter — Weights & Biases observability via REST API
// =============================================================================

import type { TelemetryPort, TelemetrySpan } from "../../../ports/telemetry.port.js";

export interface WandbConfig {
  apiKey: string;
  project: string;
  entity?: string;
}

export class WandbTelemetryAdapter implements TelemetryPort {
  private readonly config: WandbConfig;
  private readonly baseUrl = "https://api.wandb.ai";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any> | null = null;
  private pending: Promise<unknown>[] = [];

  constructor(options: { client?: unknown; config?: WandbConfig }) {
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
      this.config = {} as WandbConfig;
    } else if (options.config?.apiKey && options.config.project) {
      this.config = options.config;
    } else {
      throw new Error(
        "WandbTelemetryAdapter requires either a client or config with apiKey and project",
      );
    }
  }

  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): TelemetrySpan {
    if (this.clientPromise) {
      return new WandbClientSpan(this.clientPromise, name, attributes);
    }
    return new WandbRestSpan(this, name, attributes);
  }

  recordMetric(
    name: string,
    value: number,
    attributes?: Record<string, string>,
  ): void {
    if (this.clientPromise) {
      void this.clientPromise.then((client) => {
        client.log({ [name]: value, ...(attributes ?? {}) });
      });
      return;
    }
    const body = {
      metrics: { [name]: value },
      attributes: attributes ?? {},
      timestamp: new Date().toISOString(),
    };
    this.pending.push(this.post("/log", body));
  }

  async flush(): Promise<void> {
    if (this.clientPromise) {
      const client = await this.clientPromise;
      await client.flush?.();
      return;
    }
    await Promise.all(this.pending);
    this.pending = [];
  }

  /** @internal */
  post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const entity = this.config.entity ? `/${this.config.entity}` : "";
    return fetch(
      `${this.baseUrl}${entity}/${this.config.project}${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      },
    );
  }
}

class WandbClientSpan implements TelemetrySpan {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private runPromise: Promise<any>;
  private readonly attrs: Record<string, string | number | boolean>;
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientPromise: Promise<any>,
    private readonly name: string,
    attributes?: Record<string, string | number | boolean>,
  ) {
    this.attrs = { ...(attributes ?? {}) };
    this.runPromise = clientPromise.then((client) =>
      client.createRun({ name, config: attributes ?? {} }),
    );
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attrs[key] = value;
  }

  setStatus(code: "OK" | "ERROR", message?: string): void {
    this.statusCode = code;
    this.statusMessage = message;
  }

  end(): void {
    void this.runPromise.then((run) => {
      run.log({
        ...this.attrs,
        status: this.statusCode,
        ...(this.statusMessage ? { statusMessage: this.statusMessage } : {}),
      });
      run.finish();
    });
  }
}

class WandbRestSpan implements TelemetrySpan {
  private readonly attrs: Record<string, string | number | boolean>;
  private statusCode: "OK" | "ERROR" = "OK";
  private statusMessage?: string;
  private readonly startTime = new Date();

  constructor(
    private readonly adapter: WandbTelemetryAdapter,
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
      run: this.name,
      status: this.statusCode,
      statusMessage: this.statusMessage,
      config: this.attrs,
      startTime: this.startTime.toISOString(),
      endTime: new Date().toISOString(),
    };
    void this.adapter.post("/runs", body);
  }
}
