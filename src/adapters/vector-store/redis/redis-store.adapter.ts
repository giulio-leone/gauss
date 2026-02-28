// =============================================================================
// Redis (RediSearch) Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: redis (peer dependency, v4+) with RediSearch module enabled
//
// Usage:
//   import { RedisVectorStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new RedisVectorStoreAdapter({
//     config: { url: 'redis://localhost:6379' },
//     indexName: 'gauss-vectors',
//     dimensions: 1536,
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured redis client
//   import { createClient } from 'redis'
//   const client = createClient({ url: 'redis://localhost:6379' })
//   await client.connect()
//   const store = new RedisVectorStoreAdapter({ client, indexName: 'gauss-vectors' })
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

export interface RedisVectorStoreConfig {
  /** Redis connection URL (e.g. redis://localhost:6379) */
  url: string;
  /** Username for AUTH */
  username?: string;
  /** Password for AUTH */
  password?: string;
}

export interface RedisVectorStoreOptions {
  /** Pre-configured redis client (already connected) */
  client?: any;
  /** Config to create a client internally */
  config?: RedisVectorStoreConfig;
  /** RediSearch index name (default: 'gauss-vectors') */
  indexName?: string;
  /** Key prefix for hash documents (default: 'gauss:vec:') */
  keyPrefix?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Distance metric (default: 'COSINE') */
  distanceMetric?: "COSINE" | "L2" | "IP";
  /** HNSW M parameter (default: 16) */
  hnswM?: number;
  /** HNSW EF construction parameter (default: 200) */
  hnswEfConstruction?: number;
}

export class RedisVectorStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly indexName: string;
  private readonly keyPrefix: string;
  private readonly dimensions: number;
  private readonly distanceMetric: string;
  private readonly options: RedisVectorStoreOptions;
  private clientOwned = false;

  constructor(options: RedisVectorStoreOptions) {
    this.options = options;
    this.indexName = options.indexName ?? "gauss-vectors";
    this.keyPrefix = options.keyPrefix ?? "gauss:vec:";
    this.dimensions = options.dimensions ?? 1536;
    this.distanceMetric = options.distanceMetric ?? "COSINE";
    if (options.client) this.client = options.client;
  }

  /** Initialize — create client and FT index */
  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("RedisVectorStoreAdapter: either client or config.url is required");
      }
      const redis = await import("redis");
      const createClient = redis.createClient ?? (redis as any).default?.createClient;
      this.client = createClient({
        url: this.options.config.url,
        username: this.options.config.username,
        password: this.options.config.password,
      });
      await this.client.connect();
      this.clientOwned = true;
    }

    // Create RediSearch index if it doesn't exist
    try {
      await this.client.ft.info(this.indexName);
    } catch {
      await this.client.ft.create(
        this.indexName,
        {
          content: { type: "TEXT" as any },
          metadata: { type: "TEXT" as any },
          embedding: {
            type: "VECTOR" as any,
            ALGORITHM: "HNSW",
            TYPE: "FLOAT32",
            DIM: this.dimensions,
            DISTANCE_METRIC: this.distanceMetric,
            M: this.options.hnswM ?? 16,
            EF_CONSTRUCTION: this.options.hnswEfConstruction ?? 200,
          },
        },
        {
          ON: "HASH",
          PREFIX: this.keyPrefix,
        } as any,
      );
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (const doc of documents) {
      const key = `${this.keyPrefix}${doc.id}`;
      const embeddingBuffer = Buffer.from(new Float32Array(doc.embedding).buffer);

      await this.client.hSet(key, {
        content: doc.content,
        metadata: JSON.stringify(doc.metadata),
        embedding: embeddingBuffer,
      });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const embeddingBuffer = Buffer.from(new Float32Array(params.embedding).buffer);
    const preFilter = params.filter ? this.translateFilter(params.filter) : "*";

    const results = await this.client.ft.search(
      this.indexName,
      `(${preFilter})=>[KNN ${params.topK} @embedding $BLOB AS score]`,
      {
        PARAMS: { BLOB: embeddingBuffer },
        SORTBY: "score",
        DIALECT: 2,
        RETURN: ["content", "metadata", "score", ...(params.includeEmbeddings ? ["embedding"] : [])],
      } as any,
    );

    let mapped: VectorSearchResult[] = (results.documents ?? []).map((doc: any) => {
      const rawScore = parseFloat(doc.value?.score ?? "1");
      // RediSearch COSINE distance = 1 - cosine_similarity
      const score = this.distanceMetric === "COSINE" ? 1 - rawScore : 1 / (1 + rawScore);

      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(doc.value?.metadata ?? "{}");
      } catch {
        /* empty */
      }

      const id = doc.id.startsWith(this.keyPrefix)
        ? doc.id.slice(this.keyPrefix.length)
        : doc.id;

      return {
        id,
        content: doc.value?.content ?? "",
        metadata,
        score,
        ...(params.includeEmbeddings && doc.value?.embedding
          ? { embedding: Array.from(new Float32Array(doc.value.embedding.buffer ?? doc.value.embedding)) }
          : {}),
      };
    });

    if (params.minScore !== undefined) {
      mapped = mapped.filter((r) => r.score >= params.minScore!);
    }

    return mapped;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    for (const id of ids) {
      await this.client.del(`${this.keyPrefix}${id}`);
    }
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const info = await this.client.ft.info(this.indexName);
    return {
      totalDocuments: Number(info.numDocs ?? 0),
      dimensions: this.dimensions,
      indexType: "redis-hnsw",
    };
  }

  /** Close the Redis connection (only if we own the client) */
  async close(): Promise<void> {
    if (this.client && this.clientOwned) {
      await this.client.quit();
    }
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // RediSearch uses a custom query syntax for filters on TAG/TEXT/NUMERIC fields.
  // Metadata is stored as JSON text, so we support basic tag-style filtering
  // via @metadata pre-filter expressions.

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      const parts = (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f));
      return parts.map((p) => `(${p})`).join(" ");
    }
    if ("$or" in filter) {
      const parts = (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f));
      return parts.map((p) => `(${p})`).join(" | ");
    }
    if ("$not" in filter) {
      const inner = this.translateFilter((filter as { $not: VectorFilter }).$not);
      return `-${inner}`;
    }

    const conditions: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildRedisCondition(field, op, val));
        }
      } else {
        // Direct equality — tag match
        conditions.push(`@${this.escapeField(field)}:{${this.escapeTag(String(condition))}}`);
      }
    }

    return conditions.join(" ");
  }

  private buildRedisCondition(field: string, op: string, val: unknown): string {
    const f = this.escapeField(field);

    switch (op) {
      case "$eq":
        return `@${f}:{${this.escapeTag(String(val))}}`;
      case "$ne":
        return `-@${f}:{${this.escapeTag(String(val))}}`;
      case "$gt":
        return `@${f}:[(${val} +inf]`;
      case "$gte":
        return `@${f}:[${val} +inf]`;
      case "$lt":
        return `@${f}:[-inf (${val}]`;
      case "$lte":
        return `@${f}:[-inf ${val}]`;
      case "$in": {
        const tags = (val as unknown[]).map((v) => this.escapeTag(String(v))).join(" | ");
        return `@${f}:{${tags}}`;
      }
      case "$nin": {
        const tags = (val as unknown[]).map((v) => this.escapeTag(String(v))).join(" | ");
        return `-@${f}:{${tags}}`;
      }
      default:
        return `@${f}:{${this.escapeTag(String(val))}}`;
    }
  }

  private escapeField(field: string): string {
    return field.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  private escapeTag(value: string): string {
    return value.replace(/[,.<>{}[\]"':;!@#$%^&*()+=|\\/ ]/g, "\\$&");
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("RedisVectorStoreAdapter: call initialize() before using the adapter");
    }
  }
}
