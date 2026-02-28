// =============================================================================
// Qdrant Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @qdrant/js-client-rest (peer dependency)
//
// Usage:
//   import { QdrantStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new QdrantStoreAdapter({
//     config: { url: 'http://localhost:6333', apiKey: '...' },
//     collectionName: 'my-collection',
//     dimensions: 1536,
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured QdrantClient
//   import { QdrantClient } from '@qdrant/js-client-rest'
//   const client = new QdrantClient({ url: '...' })
//   const store = new QdrantStoreAdapter({ client, collectionName: 'my-collection' })
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

export interface QdrantStoreConfig {
  /** Qdrant server URL */
  url: string;
  /** API key (optional for local) */
  apiKey?: string;
}

export interface QdrantStoreOptions {
  /** Pre-configured QdrantClient */
  client?: any;
  /** Config to create a client internally */
  config?: QdrantStoreConfig;
  /** Collection name */
  collectionName: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Distance metric (default: 'Cosine') */
  distance?: "Cosine" | "Euclid" | "Dot";
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
  /** Auto-create collection if not exists (default: true) */
  createCollection?: boolean;
}

export class QdrantStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly collectionName: string;
  private readonly dimensions: number;
  private readonly distance: string;
  private readonly batchSize: number;
  private readonly options: QdrantStoreOptions;

  constructor(options: QdrantStoreOptions) {
    this.options = options;
    this.collectionName = options.collectionName;
    this.dimensions = options.dimensions ?? 1536;
    this.distance = options.distance ?? "Cosine";
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  /** Initialize — create client and optionally create collection */
  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("QdrantStoreAdapter: either client or config.url is required");
      }
      const qdrant = await import("@qdrant/js-client-rest");
      const QdrantClient = qdrant.QdrantClient ?? (qdrant as any).default?.QdrantClient;
      this.client = new QdrantClient({
        url: this.options.config.url,
        apiKey: this.options.config.apiKey,
      });
    }

    if (this.options.createCollection !== false) {
      try {
        await this.client.getCollection(this.collectionName);
      } catch {
        await this.client.createCollection(this.collectionName, {
          vectors: { size: this.dimensions, distance: this.distance },
        });
      }
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    const points = documents.map((doc) => ({
      id: doc.id,
      vector: doc.embedding,
      payload: { _content: doc.content, ...doc.metadata },
    }));

    for (let i = 0; i < points.length; i += this.batchSize) {
      const batch = points.slice(i, i + this.batchSize);
      await this.client.upsert(this.collectionName, { wait: true, points: batch });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const searchParams: Record<string, unknown> = {
      vector: params.embedding,
      limit: params.topK,
      with_payload: true,
      with_vector: params.includeEmbeddings ?? false,
      score_threshold: params.minScore,
    };

    if (params.filter) {
      searchParams.filter = this.translateFilter(params.filter);
    }

    const response = await this.client.search(this.collectionName, searchParams);

    let results: VectorSearchResult[] = (response ?? []).map((point: any) => {
      const { _content, ...metadata } = point.payload ?? {};
      return {
        id: String(point.id),
        content: (_content as string) ?? "",
        metadata,
        score: point.score ?? 0,
        ...(params.includeEmbeddings && point.vector ? { embedding: point.vector } : {}),
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

    await this.client.delete(this.collectionName, {
      wait: true,
      points: ids,
    });
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const info = await this.client.getCollection(this.collectionName);
    return {
      totalDocuments: info.points_count ?? info.vectors_count ?? 0,
      dimensions: this.dimensions,
      indexType: "qdrant",
    };
  }

  /** Close the client connection */
  async close(): Promise<void> {
    if (this.client?.close) await this.client.close();
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): Record<string, unknown> {
    if ("$and" in filter) {
      return {
        must: (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)),
      };
    }
    if ("$or" in filter) {
      return {
        should: (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)),
      };
    }
    if ("$not" in filter) {
      return {
        must_not: [this.translateFilter((filter as { $not: VectorFilter }).$not)],
      };
    }

    const conditions: Record<string, unknown>[] = [];

    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildQdrantCondition(field, op, val));
        }
      } else {
        conditions.push({
          key: field,
          match: { value: condition },
        });
      }
    }

    return conditions.length === 1 ? conditions[0] : { must: conditions };
  }

  private buildQdrantCondition(field: string, op: string, val: unknown): Record<string, unknown> {
    switch (op) {
      case "$eq":
        return { key: field, match: { value: val } };
      case "$ne":
        return { must_not: [{ key: field, match: { value: val } }] } as any;
      case "$gt":
        return { key: field, range: { gt: val } };
      case "$gte":
        return { key: field, range: { gte: val } };
      case "$lt":
        return { key: field, range: { lt: val } };
      case "$lte":
        return { key: field, range: { lte: val } };
      case "$in":
        return { key: field, match: { any: val } };
      case "$nin":
        return { must_not: [{ key: field, match: { any: val } }] } as any;
      default:
        return { key: field, match: { value: val } };
    }
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("QdrantStoreAdapter: call initialize() before using the adapter");
    }
  }
}
