// =============================================================================
// Upstash Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @upstash/vector (peer dependency)
//
// Usage:
//   import { UpstashStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new UpstashStoreAdapter({
//     config: { url: 'https://...upstash.io', token: 'xxx' },
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured Index client
//   import { Index } from '@upstash/vector'
//   const client = new Index({ url: '...', token: '...' })
//   const store = new UpstashStoreAdapter({ client })
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

export interface UpstashStoreConfig {
  /** Upstash Vector REST URL */
  url: string;
  /** Upstash Vector token */
  token: string;
  /** Optional namespace */
  namespace?: string;
}

export interface UpstashStoreOptions {
  /** Pre-configured Upstash Index client */
  client?: any;
  /** Config to create a client internally */
  config?: UpstashStoreConfig;
  /** Namespace (overrides config) */
  namespace?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class UpstashStoreAdapter implements VectorStorePort {
  private client: any;
  private index: any;
  private readonly namespace: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: UpstashStoreOptions;

  constructor(options: UpstashStoreOptions) {
    this.options = options;
    this.namespace = options.namespace ?? options.config?.namespace ?? "";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("UpstashStoreAdapter: either client or config is required");
      }
      const upstash = await import("@upstash/vector");
      const Index = upstash.Index ?? (upstash as any).default?.Index;
      this.client = new Index({
        url: this.options.config.url,
        token: this.options.config.token,
      });
    }

    this.index = this.namespace ? this.client.namespace(this.namespace) : this.client;
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    const vectors = documents.map((doc) => ({
      id: doc.id,
      vector: doc.embedding,
      metadata: { ...doc.metadata, _content: doc.content },
    }));

    for (let i = 0; i < vectors.length; i += this.batchSize) {
      const batch = vectors.slice(i, i + this.batchSize);
      await this.index.upsert(batch);
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const queryParams: Record<string, unknown> = {
      vector: params.embedding,
      topK: params.topK,
      includeMetadata: true,
      includeVectors: params.includeEmbeddings ?? false,
    };

    if (params.filter) {
      queryParams.filter = this.translateFilter(params.filter);
    }

    const response = await this.index.query(queryParams);

    let results: VectorSearchResult[] = (response ?? []).map((match: any) => {
      const { _content, ...metadata } = match.metadata ?? {};
      return {
        id: String(match.id),
        content: (_content as string) ?? "",
        metadata,
        score: match.score ?? 0,
        ...(params.includeEmbeddings && match.vector ? { embedding: match.vector } : {}),
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

    await this.index.delete(ids);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const info = await this.client.info();
    return {
      totalDocuments: info.vectorCount ?? 0,
      dimensions: info.dimension ?? this.dimensions,
      indexType: "upstash",
    };
  }

  async close(): Promise<void> {
    this.client = null;
    this.index = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // Upstash uses a SQL-like filter string syntax

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      const clauses = (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f));
      return `(${clauses.join(" AND ")})`;
    }
    if ("$or" in filter) {
      const clauses = (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f));
      return `(${clauses.join(" OR ")})`;
    }
    if ("$not" in filter) {
      return `NOT (${this.translateFilter((filter as { $not: VectorFilter }).$not)})`;
    }

    const conditions: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildUpstashCondition(field, op, val));
        }
      } else {
        conditions.push(`${field} = ${this.formatValue(condition)}`);
      }
    }

    return conditions.length === 1 ? conditions[0] : `(${conditions.join(" AND ")})`;
  }

  private buildUpstashCondition(field: string, op: string, val: unknown): string {
    switch (op) {
      case "$eq":
        return `${field} = ${this.formatValue(val)}`;
      case "$ne":
        return `${field} != ${this.formatValue(val)}`;
      case "$gt":
        return `${field} > ${val}`;
      case "$gte":
        return `${field} >= ${val}`;
      case "$lt":
        return `${field} < ${val}`;
      case "$lte":
        return `${field} <= ${val}`;
      case "$in": {
        const list = (val as unknown[]).map((v) => this.formatValue(v)).join(", ");
        return `${field} IN (${list})`;
      }
      case "$nin": {
        const list = (val as unknown[]).map((v) => this.formatValue(v)).join(", ");
        return `${field} NOT IN (${list})`;
      }
      default:
        return `${field} = ${this.formatValue(val)}`;
    }
  }

  private formatValue(val: unknown): string {
    if (typeof val === "string") return `'${val}'`;
    return String(val);
  }

  private ensureInitialized(): void {
    if (!this.index) {
      throw new Error("UpstashStoreAdapter: call initialize() before using the adapter");
    }
  }
}
