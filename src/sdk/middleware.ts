/**
 * Middleware SDK wrapper — request/response chain backed by Rust core.
 */
import {
  create_middleware_chain,
  middleware_use_logging,
  middleware_use_caching,
  middleware_use_rate_limit,
  destroy_middleware_chain,
} from "gauss-napi";

import type { Handle, Disposable } from "./types.js";

export class MiddlewareChain implements Disposable {
  private readonly _handle: Handle;
  private disposed = false;

  constructor() {
    this._handle = create_middleware_chain();
  }

  get handle(): Handle {
    return this._handle;
  }

  useLogging(): this {
    this.assertNotDisposed();
    middleware_use_logging(this._handle);
    return this;
  }

  useCaching(ttlMs: number): this {
    this.assertNotDisposed();
    middleware_use_caching(this._handle, ttlMs);
    return this;
  }

  useRateLimit(requestsPerMinute: number, burst?: number): this {
    this.assertNotDisposed();
    middleware_use_rate_limit(this._handle, requestsPerMinute, burst);
    return this;
  }

  destroy(): void {
    if (!this.disposed) {
      this.disposed = true;
      try {
        destroy_middleware_chain(this._handle);
      } catch {
        // Already destroyed.
      }
    }
  }

  [Symbol.dispose](): void {
    this.destroy();
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("MiddlewareChain has been destroyed");
    }
  }
}
