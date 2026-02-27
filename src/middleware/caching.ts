// =============================================================================
// CachingMiddleware — Response caching with TTL & invalidation
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeToolCallParams,
  BeforeToolCallResult,
  AfterToolCallParams,
  AfterToolCallResult,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";

export interface CachingMiddlewareOptions {
  /** Default TTL in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Max entries in cache (default: 1000) */
  maxEntries?: number;
  /** Tool names to cache (if empty, caches all tools) */
  includeTools?: string[];
  /** Tool names to exclude from caching */
  excludeTools?: string[];
  /** Custom cache key generator */
  keyGenerator?: (toolName: string, args: unknown) => string;
}

interface CacheEntry {
  result: unknown;
  createdAt: number;
  ttlMs: number;
}

export function createCachingMiddleware(
  options: CachingMiddlewareOptions = {},
): MiddlewarePort & { invalidate(toolName?: string): void; stats(): CacheStats } {
  const ttlMs = options.ttlMs ?? 300_000;
  const maxEntries = options.maxEntries ?? 1000;
  const cache = new Map<string, CacheEntry>();
  let hits = 0;
  let misses = 0;

  function makeKey(toolName: string, args: unknown): string {
    if (options.keyGenerator) return options.keyGenerator(toolName, args);
    return `${toolName}:${JSON.stringify(args)}`;
  }

  function shouldCache(toolName: string): boolean {
    if (options.excludeTools?.includes(toolName)) return false;
    if (options.includeTools && options.includeTools.length > 0) {
      return options.includeTools.includes(toolName);
    }
    return true;
  }

  function evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.createdAt > entry.ttlMs) {
        cache.delete(key);
      }
    }
  }

  function evictLRU(): void {
    if (cache.size <= maxEntries) return;
    // Delete oldest entries
    const toDelete = cache.size - maxEntries;
    const keys = cache.keys();
    for (let i = 0; i < toDelete; i++) {
      const next = keys.next();
      if (next.done) break;
      cache.delete(next.value);
    }
  }

  const middleware: MiddlewarePort & { invalidate(toolName?: string): void; stats(): CacheStats } = {
    name: "gauss:caching",
    priority: MiddlewarePriority.EARLY,

    beforeTool(
      _ctx: MiddlewareContext,
      params: BeforeToolCallParams,
    ): BeforeToolCallResult | void {
      if (!shouldCache(params.toolName)) return;

      evictExpired();
      const key = makeKey(params.toolName, params.args);
      const entry = cache.get(key);

      if (entry && Date.now() - entry.createdAt <= entry.ttlMs) {
        hits++;
        return { skip: true, mockResult: entry.result };
      }

      misses++;
    },

    afterTool(
      _ctx: MiddlewareContext,
      params: AfterToolCallParams,
    ): AfterToolCallResult | void {
      if (!shouldCache(params.toolName)) return;

      const key = makeKey(params.toolName, params.args);
      cache.set(key, {
        result: params.result,
        createdAt: Date.now(),
        ttlMs,
      });
      evictLRU();
    },

    invalidate(toolName?: string): void {
      if (!toolName) {
        cache.clear();
        return;
      }
      for (const key of cache.keys()) {
        if (key.startsWith(`${toolName}:`)) {
          cache.delete(key);
        }
      }
    },

    stats(): CacheStats {
      return {
        size: cache.size,
        hits,
        misses,
        hitRate: hits + misses > 0 ? hits / (hits + misses) : 0,
      };
    },
  };

  return middleware;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}
