// =============================================================================
// Marqo Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: marqo (peer dependency)
//
// Usage:
//   const store = new MarqoStoreAdapter({
//     config: { url: 'http://localhost:8882', indexName: 'my-index' },
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

export interface MarqoStoreConfig {
  /** Marqo URL */
  url: string;
  /** Index name */
  indexName: string;
  /** API key (optional, for Marqo Cloud) */
  apiKey?: string;
}

export interface MarqoStoreOptions {
  /** Pre-configured Marqo client */
  client?: any;
  /** Config to create a client internally */
  config?: MarqoStoreConfig;
  /** Index name (overrides config) */
  indexName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class MarqoStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly indexName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: MarqoStoreOptions;

  constructor(options: MarqoStoreOptions) {
    this.options = options;
    this.indexName = options.indexName ?? options.config?.indexName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("MarqoStoreAdapter: either client or config.url is required");
      }
      const marqo = await import("marqo");
      const Client = marqo.Client ?? (marqo as any).default?.Client ?? (marqo as any).default;
      this.client = new Client(this.options.config.url, this.options.config.apiKey);
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const marqoDocs = batch.map((doc) => ({
        _id: doc.id,
        content: doc.content,
        ...doc.metadata,
        _embedding: doc.embedding,
      }));
      await this.client.index(this.indexName).addDocuments(marqoDocs, {
        tensorFields: ["content"],
      });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const searchParams: Record<string, unknown> = {
      limit: params.topK,
      context: { tensor: [{ vector: params.embedding, weight: 1 }] },
    };

    if (params.filter) {
      searchParams.filter = this.translateFilter(params.filter);
    }

    const response = await this.client.index(this.indexName).search("", searchParams);
    const hits = response.hits ?? [];

    let results: VectorSearchResult[] = hits.map((hit: any) => {
      const { _id, _score, content, _embedding, _highlights, ...metadata } = hit;
      return {
        id: _id ?? "",
        content: content ?? "",
        metadata,
        score: _score ?? 0,
        ...(params.includeEmbeddings && _embedding ? { embedding: _embedding } : {}),
      };
    });

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    await this.client.index(this.indexName).deleteDocuments(ids);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const stats = await this.client.index(this.indexName).getStats();
    return {
      totalDocuments: stats.numberOfDocuments ?? 0,
      dimensions: this.dimensions,
      indexType: "marqo",
    };
  }

  async close(): Promise<void> {
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      return (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)).join(" AND ");
    }
    if ("$or" in filter) {
      return `(${(filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)).join(" OR ")})`;
    }
    if ("$not" in filter) {
      return `NOT (${this.translateFilter((filter as { $not: VectorFilter }).$not)})`;
    }

    const parts: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          parts.push(this.buildCondition(field, op, val));
        }
      } else {
        parts.push(`${field}:${this.literal(condition)}`);
      }
    }
    return parts.join(" AND ");
  }

  private buildCondition(field: string, op: string, val: unknown): string {
    switch (op) {
      case "$eq": return `${field}:${this.literal(val)}`;
      case "$ne": return `NOT ${field}:${this.literal(val)}`;
      case "$gt": return `${field}:>${val}`;
      case "$gte": return `${field}:>=${val}`;
      case "$lt": return `${field}:<${val}`;
      case "$lte": return `${field}:<=${val}`;
      case "$in": return `(${(val as unknown[]).map((v) => `${field}:${this.literal(v)}`).join(" OR ")})`;
      case "$nin": return `NOT (${(val as unknown[]).map((v) => `${field}:${this.literal(v)}`).join(" OR ")})`;
      default: return `${field}:${this.literal(val)}`;
    }
  }

  private literal(val: unknown): string {
    if (typeof val === "string") return `"${val.replace(/"/g, '\\"')}"`;
    return String(val);
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("MarqoStoreAdapter: call initialize() before using the adapter");
    }
  }
}
