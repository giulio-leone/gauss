// =============================================================================
// Vald Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// gRPC-based distributed vector search engine.
// Uses native fetch for REST gateway fallback.
//
// Usage:
//   const store = new ValdStoreAdapter({
//     config: { host: 'localhost', port: 8081 },
//   })
//   await store.initialize()
//
// =============================================================================

import type {
  VectorStorePort,
  VectorDocument,
  VectorSearchResult,
  VectorSearchParams,
  VectorIndexStats,
  VectorFilter,
} from "../../../ports/vector-store.port.js";

export interface ValdStoreConfig {
  /** Vald gateway host */
  host: string;
  /** Vald gateway port (default: 8081) */
  port: number;
}

export interface ValdStoreOptions {
  /** Pre-configured gRPC/REST client */
  client?: any;
  /** Config to create adapter */
  config?: ValdStoreConfig;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class ValdStoreAdapter implements VectorStorePort {
  private client: any;
  private baseUrl: string = "";
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: ValdStoreOptions;

  constructor(options: ValdStoreOptions) {
    this.options = options;
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("ValdStoreAdapter: either client or config is required");
      }
      this.baseUrl = `http://${this.options.config.host}:${this.options.config.port}`;
      this.client = { fetch: globalThis.fetch.bind(globalThis) };
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const requests = batch.map((doc) => ({
        vector: {
          id: doc.id,
          vector: doc.embedding,
        },
        config: {
          skip_strict_exist_check: true,
        },
      }));
      await this.client.fetch(`${this.baseUrl}/insert/multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const response = await this.client.fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector: params.embedding,
        config: {
          num: params.topK,
          radius: -1,
          epsilon: 0.1,
        },
      }),
    });

    const data = typeof response.json === "function" ? await response.json() : response;
    const hits = data.results ?? [];

    let results: VectorSearchResult[] = hits.map((hit: any) => ({
      id: hit.id ?? "",
      content: "",
      metadata: {},
      score: hit.distance != null ? 1 / (1 + hit.distance) : 0,
    }));

    if (params.filter) {
      results = results.filter((r) => this.matchesFilter(r.metadata, params.filter!));
    }

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    const requests = ids.map((id) => ({ id: { id } }));
    await this.client.fetch(`${this.baseUrl}/remove/multi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const response = await this.client.fetch(`${this.baseUrl}/index/info`);
    const data = typeof response.json === "function" ? await response.json() : response;

    return {
      totalDocuments: data.count ?? 0,
      dimensions: this.dimensions,
      indexType: "vald",
    };
  }

  async close(): Promise<void> {
    this.client = null;
  }

  // ─── Filter Matching (post-filter, Vald has no native metadata) ─────

  private matchesFilter(metadata: Record<string, unknown>, filter: VectorFilter): boolean {
    if ("$and" in filter) {
      return (filter as { $and: VectorFilter[] }).$and.every((f) => this.matchesFilter(metadata, f));
    }
    if ("$or" in filter) {
      return (filter as { $or: VectorFilter[] }).$or.some((f) => this.matchesFilter(metadata, f));
    }
    if ("$not" in filter) {
      return !this.matchesFilter(metadata, (filter as { $not: VectorFilter }).$not);
    }

    for (const [field, condition] of Object.entries(filter)) {
      const val = metadata[field];
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, expected] of Object.entries(condition as Record<string, unknown>)) {
          if (!this.evalOp(val, op, expected)) return false;
        }
      } else {
        if (val !== condition) return false;
      }
    }
    return true;
  }

  private evalOp(val: unknown, op: string, expected: unknown): boolean {
    switch (op) {
      case "$eq": return val === expected;
      case "$ne": return val !== expected;
      case "$gt": return (val as number) > (expected as number);
      case "$gte": return (val as number) >= (expected as number);
      case "$lt": return (val as number) < (expected as number);
      case "$lte": return (val as number) <= (expected as number);
      case "$in": return (expected as unknown[]).includes(val);
      case "$nin": return !(expected as unknown[]).includes(val);
      default: return val === expected;
    }
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("ValdStoreAdapter: call initialize() before using the adapter");
    }
  }
}
