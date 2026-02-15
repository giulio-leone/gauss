/**
 * LRU Cache with TTL support for tool execution results
 */

export interface ToolCacheConfig {
  readonly defaultTtlMs: number;
  readonly maxSize: number;
}

export const DEFAULT_TOOL_CACHE_CONFIG: ToolCacheConfig = {
  defaultTtlMs: 300_000, // 5 minutes
  maxSize: 1000,
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

export class ToolCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();

  constructor(private readonly config: ToolCacheConfig = DEFAULT_TOOL_CACHE_CONFIG) {}

  /**
   * Check if a non-expired entry exists for the key
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get a cached value
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.missCount++;
      return undefined;
    }

    const now = Date.now();
    
    // Check if expired
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.missCount++;
      return undefined;
    }

    // Move to end for LRU ordering
    this.cache.delete(key);
    this.cache.set(key, entry);

    entry.lastAccessed = now;
    this.hitCount++;
    
    return entry.value;
  }

  /**
   * Set a cached value
   */
  set(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs ?? this.config.defaultTtlMs;
    
    // Handle zero or negative TTL - don't cache
    if (ttl <= 0) {
      return;
    }
    
    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + ttl,
      lastAccessed: now,
    };

    // If cache is at capacity, remove LRU item
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      // Don't add if max size is 0
      if (this.config.maxSize === 0) {
        return;
      }
      this.evictLRU();
    }

    // Delete before set to move existing key to end of insertion order (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   */
  get size(): number {
    this.cleanupExpired();
    return this.cache.size;
  }

  /**
   * Get cache hit/miss statistics
   */
  getStats(): { hits: number; misses: number; size: number } {
    this.cleanupExpired();
    return {
      hits: this.hitCount,
      misses: this.missCount,
      size: this.cache.size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }

  private hitCount = 0;
  private missCount = 0;

  private evictLRU(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expired.push(key);
      }
    }

    expired.forEach(key => this.cache.delete(key));
  }
}