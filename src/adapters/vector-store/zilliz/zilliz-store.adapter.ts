// =============================================================================
// Zilliz Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @zilliz/milvus2-sdk-node (peer dependency)
//
// Managed Milvus service (Zilliz Cloud). Uses the same SDK as Milvus
// but connects via URI + token authentication.
//
// Usage:
//   const store = new ZillizStoreAdapter({
//     config: { uri: 'https://...zillizcloud.com', token: '...', collectionName: 'my_col' },
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

export interface ZillizStoreConfig {
  /** Zilliz Cloud URI */
  uri: string;
  /** API token */
  token: string;
  /** Collection name */
  collectionName: string;
}

export interface ZillizStoreOptions {
  /** Pre-configured MilvusClient */
  client?: any;
  /** Config to create a client internally */
  config?: ZillizStoreConfig;
  /** Collection name (overrides config) */
  collectionName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class ZillizStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly collectionName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: ZillizStoreOptions;

  constructor(options: ZillizStoreOptions) {
    this.options = options;
    this.collectionName = options.collectionName ?? options.config?.collectionName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("ZillizStoreAdapter: either client or config is required");
      }
      const milvus = await import("@zilliz/milvus2-sdk-node");
      const MilvusClient = milvus.MilvusClient ?? (milvus as any).default?.MilvusClient;
      this.client = new MilvusClient({
        address: this.options.config.uri,
        token: this.options.config.token,
        ssl: true,
      });
    }

    const hasCollection = await this.client.hasCollection({
      collection_name: this.collectionName,
    });

    if (!hasCollection.value) {
      await this.client.createCollection({
        collection_name: this.collectionName,
        fields: [
          { name: "id", data_type: 21, is_primary_key: true, max_length: 512 },
          { name: "embedding", data_type: 101, dim: this.dimensions },
          { name: "content", data_type: 21, max_length: 65535 },
          { name: "metadata", data_type: 21, max_length: 65535 },
        ],
      });

      await this.client.createIndex({
        collection_name: this.collectionName,
        field_name: "embedding",
        index_type: "AUTOINDEX",
        metric_type: "COSINE",
      });
    }

    await this.client.loadCollection({ collection_name: this.collectionName });
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
      await this.client.upsert({ collection_name: this.collectionName, data: batch });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const searchParams: Record<string, unknown> = {
      collection_name: this.collectionName,
      vector: params.embedding,
      limit: params.topK,
      output_fields: ["id", "content", "metadata"],
      metric_type: "COSINE",
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
      try { metadata = JSON.parse(hit.metadata ?? "{}"); } catch { /* empty */ }
      return {
        id: hit.id,
        content: hit.content ?? "",
        metadata,
        score: hit.score ?? 0,
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
    await this.client.delete({ collection_name: this.collectionName, filter: expr });
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
      indexType: "zilliz",
    };
  }

  async close(): Promise<void> {
    if (this.client?.close) await this.client.close();
    this.client = null;
  }

  // ─── Filter Translation (Milvus-compatible expressions) ───────────────

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
      return `!(${this.translateFilter((filter as { $not: VectorFilter }).$not)})`;
    }

    const conditions: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      const f = field.replace(/[^a-zA-Z0-9_]/g, "_");
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildCondition(f, op, val));
        }
      } else {
        conditions.push(`${f} == ${this.literal(condition)}`);
      }
    }
    return conditions.join(" && ");
  }

  private buildCondition(field: string, op: string, val: unknown): string {
    switch (op) {
      case "$eq": return `${field} == ${this.literal(val)}`;
      case "$ne": return `${field} != ${this.literal(val)}`;
      case "$gt": return `${field} > ${this.literal(val)}`;
      case "$gte": return `${field} >= ${this.literal(val)}`;
      case "$lt": return `${field} < ${this.literal(val)}`;
      case "$lte": return `${field} <= ${this.literal(val)}`;
      case "$in": return `${field} in [${(val as unknown[]).map((v) => this.literal(v)).join(", ")}]`;
      case "$nin": return `${field} not in [${(val as unknown[]).map((v) => this.literal(v)).join(", ")}]`;
      default: return `${field} == ${this.literal(val)}`;
    }
  }

  private literal(val: unknown): string {
    if (typeof val === "string") return `"${val.replace(/"/g, '\\"')}"`;
    if (typeof val === "boolean") return val ? "true" : "false";
    return String(val);
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("ZillizStoreAdapter: call initialize() before using the adapter");
    }
  }
}
