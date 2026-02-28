// =============================================================================
// Typesense Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: typesense (peer dependency)
//
// Usage:
//   const store = new TypesenseStoreAdapter({
//     config: {
//       nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
//       apiKey: 'xyz',
//       collectionName: 'vectors',
//     },
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

export interface TypesenseStoreConfig {
  /** Typesense nodes */
  nodes: Array<{ host: string; port: number; protocol: string }>;
  /** API key */
  apiKey: string;
  /** Collection name */
  collectionName: string;
}

export interface TypesenseStoreOptions {
  /** Pre-configured Typesense client */
  client?: any;
  /** Config to create a client internally */
  config?: TypesenseStoreConfig;
  /** Collection name (overrides config) */
  collectionName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class TypesenseStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly collectionName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: TypesenseStoreOptions;

  constructor(options: TypesenseStoreOptions) {
    this.options = options;
    this.collectionName = options.collectionName ?? options.config?.collectionName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("TypesenseStoreAdapter: either client or config is required");
      }
      const typesense = await import("typesense");
      const Client = typesense.Client ?? (typesense as any).default?.Client;
      this.client = new Client({
        nodes: this.options.config.nodes,
        apiKey: this.options.config.apiKey,
        connectionTimeoutSeconds: 10,
      });
    }

    try {
      await this.client.collections(this.collectionName).retrieve();
    } catch {
      await this.client.collections().create({
        name: this.collectionName,
        fields: [
          { name: "content", type: "string" },
          { name: "metadata", type: "object" },
          { name: "embedding", type: `float[]`, num_dim: this.dimensions },
        ],
      });
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const tsDocuments = batch.map((doc) => ({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        embedding: doc.embedding,
      }));
      await this.client
        .collections(this.collectionName)
        .documents()
        .import(tsDocuments, { action: "upsert" });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const searchParams: Record<string, unknown> = {
      q: "*",
      vector_query: `embedding:([${params.embedding.join(",")}], k:${params.topK})`,
      per_page: params.topK,
    };

    if (params.filter) {
      searchParams.filter_by = this.translateFilter(params.filter);
    }

    const response = await this.client
      .collections(this.collectionName)
      .documents()
      .search(searchParams);

    const hits = response.hits ?? [];

    let results: VectorSearchResult[] = hits.map((hit: any) => {
      const doc = hit.document ?? {};
      return {
        id: doc.id ?? "",
        content: doc.content ?? "",
        metadata: doc.metadata ?? {},
        score: hit.vector_distance != null ? 1 / (1 + hit.vector_distance) : 0,
        ...(params.includeEmbeddings && doc.embedding ? { embedding: doc.embedding } : {}),
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

    for (const id of ids) {
      await this.client.collections(this.collectionName).documents(id).delete();
    }
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const info = await this.client.collections(this.collectionName).retrieve();
    return {
      totalDocuments: info.num_documents ?? 0,
      dimensions: this.dimensions,
      indexType: "typesense",
    };
  }

  async close(): Promise<void> {
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      return (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)).join(" && ");
    }
    if ("$or" in filter) {
      return (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)).join(" || ");
    }
    if ("$not" in filter) {
      return `!(${this.translateFilter((filter as { $not: VectorFilter }).$not)})`;
    }

    const parts: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      const key = `metadata.${field}`;
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          parts.push(this.buildCondition(key, op, val));
        }
      } else {
        parts.push(`${key}:=${this.tsLiteral(condition)}`);
      }
    }
    return parts.join(" && ");
  }

  private buildCondition(field: string, op: string, val: unknown): string {
    switch (op) {
      case "$eq": return `${field}:=${this.tsLiteral(val)}`;
      case "$ne": return `${field}:!=${this.tsLiteral(val)}`;
      case "$gt": return `${field}:>${val}`;
      case "$gte": return `${field}:>=${val}`;
      case "$lt": return `${field}:<${val}`;
      case "$lte": return `${field}:<=${val}`;
      case "$in": return `${field}:[${(val as unknown[]).map((v) => this.tsLiteral(v)).join(",")}]`;
      case "$nin": return `${field}:!=[${(val as unknown[]).map((v) => this.tsLiteral(v)).join(",")}]`;
      default: return `${field}:=${this.tsLiteral(val)}`;
    }
  }

  private tsLiteral(val: unknown): string {
    if (typeof val === "string") return `\`${val}\``;
    return String(val);
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("TypesenseStoreAdapter: call initialize() before using the adapter");
    }
  }
}
