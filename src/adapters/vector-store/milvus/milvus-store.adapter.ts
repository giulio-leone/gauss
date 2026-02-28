// =============================================================================
// Milvus Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @zilliz/milvus2-sdk-node (peer dependency)
//
// Usage:
//   import { MilvusStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new MilvusStoreAdapter({
//     config: { address: 'localhost:19530' },
//     collectionName: 'gauss_vectors',
//     dimensions: 1536,
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured MilvusClient
//   import { MilvusClient } from '@zilliz/milvus2-sdk-node'
//   const client = new MilvusClient({ address: 'localhost:19530' })
//   const store = new MilvusStoreAdapter({ client, collectionName: 'gauss_vectors' })
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

export interface MilvusStoreConfig {
  /** Milvus server address (e.g. 'localhost:19530') */
  address: string;
  /** Username (optional) */
  username?: string;
  /** Password (optional) */
  password?: string;
  /** Use SSL (default: false) */
  ssl?: boolean;
}

export interface MilvusStoreOptions {
  /** Pre-configured MilvusClient */
  client?: any;
  /** Config to create a client internally */
  config?: MilvusStoreConfig;
  /** Collection name */
  collectionName: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Metric type (default: 'COSINE') */
  metricType?: "COSINE" | "L2" | "IP";
  /** Index type (default: 'HNSW') */
  indexType?: string;
  /** Auto-create collection if not exists (default: true) */
  createCollection?: boolean;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class MilvusStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly collectionName: string;
  private readonly dimensions: number;
  private readonly metricType: string;
  private readonly indexType: string;
  private readonly batchSize: number;
  private readonly options: MilvusStoreOptions;

  constructor(options: MilvusStoreOptions) {
    this.options = options;
    this.collectionName = options.collectionName;
    this.dimensions = options.dimensions ?? 1536;
    this.metricType = options.metricType ?? "COSINE";
    this.indexType = options.indexType ?? "HNSW";
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  /** Initialize — create client, collection, and load into memory */
  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("MilvusStoreAdapter: either client or config.address is required");
      }
      const milvus = await import("@zilliz/milvus2-sdk-node");
      const MilvusClient = milvus.MilvusClient ?? (milvus as any).default?.MilvusClient;
      this.client = new MilvusClient({
        address: this.options.config.address,
        username: this.options.config.username,
        password: this.options.config.password,
        ssl: this.options.config.ssl ?? false,
      });
    }

    if (this.options.createCollection !== false) {
      const hasCollection = await this.client.hasCollection({
        collection_name: this.collectionName,
      });

      if (!hasCollection.value) {
        await this.client.createCollection({
          collection_name: this.collectionName,
          fields: [
            { name: "id", data_type: 21 /* VarChar */, is_primary_key: true, max_length: 512 },
            { name: "embedding", data_type: 101 /* FloatVector */, dim: this.dimensions },
            { name: "content", data_type: 21 /* VarChar */, max_length: 65535 },
            { name: "metadata", data_type: 21 /* VarChar */, max_length: 65535 },
          ],
        });

        await this.client.createIndex({
          collection_name: this.collectionName,
          field_name: "embedding",
          index_type: this.indexType,
          metric_type: this.metricType,
          params: { M: 16, efConstruction: 256 },
        });
      }

      await this.client.loadCollection({ collection_name: this.collectionName });
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    const rows = documents.map((doc) => ({
      id: doc.id,
      embedding: doc.embedding,
      content: doc.content,
      metadata: JSON.stringify(doc.metadata),
    }));

    for (let i = 0; i < rows.length; i += this.batchSize) {
      const batch = rows.slice(i, i + this.batchSize);
      await this.client.upsert({
        collection_name: this.collectionName,
        data: batch,
      });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const searchParams: Record<string, unknown> = {
      collection_name: this.collectionName,
      vector: params.embedding,
      limit: params.topK,
      output_fields: ["id", "content", "metadata"],
      metric_type: this.metricType,
    };

    if (params.includeEmbeddings) {
      (searchParams.output_fields as string[]).push("embedding");
    }

    if (params.filter) {
      searchParams.filter = this.translateFilter(params.filter);
    }

    const response = await this.client.search(searchParams);
    const hits = response.results ?? [];

    let results: VectorSearchResult[] = hits.map((hit: any) => {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(hit.metadata ?? "{}");
      } catch {
        /* empty */
      }

      // Milvus COSINE distance is already similarity (0-1)
      const score = hit.score ?? 0;
      return {
        id: hit.id,
        content: hit.content ?? "",
        metadata,
        score,
        ...(params.includeEmbeddings && hit.embedding ? { embedding: hit.embedding } : {}),
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

    const expr = `id in [${ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")}]`;
    await this.client.delete({
      collection_name: this.collectionName,
      filter: expr,
    });
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const stats = await this.client.getCollectionStatistics({
      collection_name: this.collectionName,
    });

    const rowCount = Number(
      stats.data?.row_count ?? stats.stats?.find((s: any) => s.key === "row_count")?.value ?? 0,
    );

    return {
      totalDocuments: rowCount,
      dimensions: this.dimensions,
      indexType: `milvus-${this.indexType.toLowerCase()}`,
    };
  }

  /** Close the Milvus client connection */
  async close(): Promise<void> {
    if (this.client?.close) await this.client.close();
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // Milvus uses SQL-like boolean expressions for filtering.

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      const parts = (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f));
      return `(${parts.join(" && ")})`;
    }
    if ("$or" in filter) {
      const parts = (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f));
      return `(${parts.join(" || ")})`;
    }
    if ("$not" in filter) {
      const inner = this.translateFilter((filter as { $not: VectorFilter }).$not);
      return `!(${inner})`;
    }

    const conditions: string[] = [];

    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildMilvusCondition(field, op, val));
        }
      } else {
        conditions.push(`${this.escapeField(field)} == ${this.milvusLiteral(condition)}`);
      }
    }

    return conditions.join(" && ");
  }

  private buildMilvusCondition(field: string, op: string, val: unknown): string {
    const f = this.escapeField(field);

    switch (op) {
      case "$eq":
        return `${f} == ${this.milvusLiteral(val)}`;
      case "$ne":
        return `${f} != ${this.milvusLiteral(val)}`;
      case "$gt":
        return `${f} > ${this.milvusLiteral(val)}`;
      case "$gte":
        return `${f} >= ${this.milvusLiteral(val)}`;
      case "$lt":
        return `${f} < ${this.milvusLiteral(val)}`;
      case "$lte":
        return `${f} <= ${this.milvusLiteral(val)}`;
      case "$in": {
        const items = (val as unknown[]).map((v) => this.milvusLiteral(v)).join(", ");
        return `${f} in [${items}]`;
      }
      case "$nin": {
        const items = (val as unknown[]).map((v) => this.milvusLiteral(v)).join(", ");
        return `${f} not in [${items}]`;
      }
      default:
        return `${f} == ${this.milvusLiteral(val)}`;
    }
  }

  private milvusLiteral(val: unknown): string {
    if (typeof val === "string") return `"${val.replace(/"/g, '\\"')}"`;
    if (typeof val === "boolean") return val ? "true" : "false";
    return String(val);
  }

  private escapeField(field: string): string {
    // Milvus field names should be valid identifiers
    return field.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("MilvusStoreAdapter: call initialize() before using the adapter");
    }
  }
}
