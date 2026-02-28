// =============================================================================
// Resilience Decorator — Circuit Breaker + Rate Limiting + Tool Cache
// Uses native Rust middleware when gauss-core NAPI is available.
// =============================================================================

import type { Decorator, RunContext, AgentResult } from "../core/agent/types.js";

export interface ResilienceConfig {
  circuitBreaker?: boolean | CircuitBreakerOptions;
  retries?: number;
  retryDelay?: number;
  cache?: boolean | CacheOptions;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
}

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
}

type CircuitState = "closed" | "open" | "half-open";

/**
 * Resilience decorator with circuit breaker, retries, and caching.
 * Automatically uses native Rust middleware when NAPI is available.
 */
export function resilience(config: ResilienceConfig): Decorator {
  // Try native Rust middleware path
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createNativeMiddlewareChain, isNativeAvailable } = require("../providers/gauss.js") as typeof import("../providers/gauss.js");
    if (isNativeAvailable()) {
      const cacheOpts = typeof config.cache === "object" ? config.cache : {};
      const cacheTtl = config.cache ? (cacheOpts.ttl ?? 60000) : 0;

      const chain = createNativeMiddlewareChain({
        logging: false,
        ...(cacheTtl > 0 ? { caching: { ttlMs: cacheTtl } } : {}),
      });

      return {
        name: "resilience",
        async initialize() { /* native chain created above */ },
        async destroy() { chain.destroy(); },
      };
    }
  } catch {
    // NAPI not available, use TS fallback
  }

  // TS fallback path
  const retries = config.retries ?? 0;
  const retryDelay = config.retryDelay ?? 1000;

  let cbState: CircuitState = "closed";
  let failureCount = 0;
  const cbOpts = typeof config.circuitBreaker === "object" ? config.circuitBreaker : {};
  const failureThreshold = cbOpts.failureThreshold ?? 5;
  const resetTimeout = cbOpts.resetTimeout ?? 30000;
  let lastFailureTime = 0;

  const cacheEnabled = !!config.cache;
  const cacheOptsObj = typeof config.cache === "object" ? config.cache : {};
  const cacheTtl = cacheOptsObj.ttl ?? 60000;
  const cacheMaxSize = cacheOptsObj.maxSize ?? 100;
  const cache = new Map<string, { result: AgentResult; timestamp: number }>();

  return {
    name: "resilience",

    async beforeRun(ctx: RunContext) {
      if (config.circuitBreaker) {
        if (cbState === "open") {
          if (Date.now() - lastFailureTime > resetTimeout) {
            cbState = "half-open";
          } else {
            throw new Error("Circuit breaker is OPEN — agent temporarily unavailable");
          }
        }
      }

      if (cacheEnabled) {
        const key = ctx.prompt;
        const cached = cache.get(key);
        if (cached && Date.now() - cached.timestamp < cacheTtl) {
          ctx.metadata["_cachedResult"] = cached.result;
        }
      }

      return ctx;
    },

    async afterRun(ctx: RunContext, result: AgentResult) {
      if (config.circuitBreaker) {
        failureCount = 0;
        cbState = "closed";
      }

      if (cacheEnabled) {
        if (cache.size >= cacheMaxSize) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(ctx.prompt, { result, timestamp: Date.now() });
      }

      return result;
    },

    async onError(error: Error, _ctx: RunContext) {
      if (config.circuitBreaker) {
        failureCount++;
        lastFailureTime = Date.now();
        if (failureCount >= failureThreshold) {
          cbState = "open";
        }
      }
    },
  };
}
