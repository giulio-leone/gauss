// =============================================================================
// Redis Storage Adapter — Implements StorageDomainPort with caching support
// =============================================================================
//
// Requires: ioredis (peer dependency)
//
// Usage:
//   import { RedisStorageAdapter } from 'gauss'
//   const storage = new RedisStorageAdapter({ url: 'redis://localhost:6379' })
//
// =============================================================================

import type {
  StorageDomainPort,
  StorageDomain,
  StorageRecord,
  StorageQuery,
  PaginatedResult,
} from "../../../ports/storage-domain.port.js";

export interface RedisStorageOptions {
  /** Redis connection URL (e.g., redis://localhost:6379) */
  url?: string;
  /** Key prefix (default: 'gauss') */
  prefix?: string;
  /** TTL for records in seconds (0 = no expiry, default: 0) */
  ttl?: number;
}

export class RedisStorageAdapter implements StorageDomainPort {
  private client: any;
  private readonly prefix: string;
  private readonly ttl: number;
  private readonly options: RedisStorageOptions;

  constructor(options: RedisStorageOptions = {}) {
    this.options = options;
    this.prefix = options.prefix ?? "gauss";
    this.ttl = options.ttl ?? 0;
  }

  /** Initialize the Redis connection */
  async initialize(): Promise<void> {
    const Redis = (await import("ioredis")).default;
    this.client = new Redis(this.options.url ?? "redis://localhost:6379");
  }

  private key(domain: StorageDomain, id: string): string {
    return `${this.prefix}:${domain}:${id}`;
  }

  private domainKey(domain: StorageDomain): string {
    return `${this.prefix}:idx:${domain}`;
  }

  async put(
    domain: StorageDomain,
    id: string,
    data: Record<string, unknown>,
  ): Promise<StorageRecord> {
    const now = Date.now();
    const existing = await this.get(domain, id);
    const record: StorageRecord = {
      id,
      domain,
      data,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const k = this.key(domain, id);
    const pipeline = this.client.pipeline();
    pipeline.set(k, JSON.stringify(record));
    if (this.ttl > 0) pipeline.expire(k, this.ttl);
    pipeline.sadd(this.domainKey(domain), id);
    await pipeline.exec();

    return { ...record };
  }

  async get(domain: StorageDomain, id: string): Promise<StorageRecord | null> {
    const raw = await this.client.get(this.key(domain, id));
    if (!raw) return null;
    return JSON.parse(raw) as StorageRecord;
  }

  async delete(domain: StorageDomain, id: string): Promise<boolean> {
    const pipeline = this.client.pipeline();
    pipeline.del(this.key(domain, id));
    pipeline.srem(this.domainKey(domain), id);
    const results = await pipeline.exec();
    return results[0][1] > 0;
  }

  async query(params: StorageQuery): Promise<PaginatedResult<StorageRecord>> {
    const ids = await this.client.smembers(this.domainKey(params.domain));
    if (ids.length === 0) {
      return { items: [], total: 0, limit: params.limit ?? 50, offset: params.offset ?? 0, hasMore: false };
    }

    // Fetch all records in bulk
    const keys = ids.map((id: string) => this.key(params.domain, id));
    const raws = await this.client.mget(...keys);
    let items: StorageRecord[] = raws
      .filter((r: string | null) => r !== null)
      .map((r: string) => JSON.parse(r));

    // Filter
    if (params.filter) {
      items = items.filter((r) => {
        for (const [key, val] of Object.entries(params.filter!)) {
          if (r.data[key] !== val) return false;
        }
        return true;
      });
    }

    // Sort
    if (params.orderBy) {
      const dir = params.orderDir === "desc" ? -1 : 1;
      const field = params.orderBy;
      items.sort((a, b) => {
        const va = field === "createdAt" || field === "updatedAt" ? a[field] : a.data[field];
        const vb = field === "createdAt" || field === "updatedAt" ? b[field] : b.data[field];
        if (va === vb) return 0;
        if (va === undefined || va === null) return 1;
        if (vb === undefined || vb === null) return -1;
        return (va as any) < (vb as any) ? -dir : dir;
      });
    }

    const total = items.length;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    const paged = items.slice(offset, offset + limit);

    return { items: paged, total, limit, offset, hasMore: offset + limit < total };
  }

  async count(domain: StorageDomain): Promise<number> {
    return this.client.scard(this.domainKey(domain));
  }

  async clear(domain: StorageDomain): Promise<number> {
    const ids: string[] = await this.client.smembers(this.domainKey(domain));
    if (ids.length === 0) return 0;

    const keys = ids.map((id) => this.key(domain, id));
    const pipeline = this.client.pipeline();
    for (const k of keys) pipeline.del(k);
    pipeline.del(this.domainKey(domain));
    await pipeline.exec();
    return ids.length;
  }

  /** Close the Redis connection */
  async close(): Promise<void> {
    if (this.client) await this.client.quit();
  }
}
