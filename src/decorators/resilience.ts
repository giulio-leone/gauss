// =============================================================================
// Resilience Decorator — Circuit Breaker + Rate Limiting + Tool Cache
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

export function resilience(config: ResilienceConfig): Decorator {
  const retries = config.retries ?? 0;
  const retryDelay = config.retryDelay ?? 1000;

  // Circuit breaker state
  let cbState: CircuitState = "closed";
  let failureCount = 0;
  const cbOpts = typeof config.circuitBreaker === "object" ? config.circuitBreaker : {};
  const failureThreshold = cbOpts.failureThreshold ?? 5;
  const resetTimeout = cbOpts.resetTimeout ?? 30000;
  let lastFailureTime = 0;

  // Simple result cache
  const cacheEnabled = !!config.cache;
  const cacheOpts = typeof config.cache === "object" ? config.cache : {};
  const cacheTtl = cacheOpts.ttl ?? 60000;
  const cacheMaxSize = cacheOpts.maxSize ?? 100;
  const cache = new Map<string, { result: AgentResult; timestamp: number }>();

  return {
    name: "resilience",

    async beforeRun(ctx: RunContext) {
      // Circuit breaker check
      if (config.circuitBreaker) {
        if (cbState === "open") {
          if (Date.now() - lastFailureTime > resetTimeout) {
            cbState = "half-open";
          } else {
            throw new Error("Circuit breaker is OPEN — agent temporarily unavailable");
          }
        }
      }

      // Cache lookup
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
      // Circuit breaker: reset on success
      if (config.circuitBreaker) {
        failureCount = 0;
        cbState = "closed";
      }

      // Cache store
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
