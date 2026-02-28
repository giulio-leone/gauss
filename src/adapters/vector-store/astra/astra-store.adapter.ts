// =============================================================================
// Astra DB Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @datastax/astra-db-ts (peer dependency)
//
// Usage:
//   import { AstraStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new AstraStoreAdapter({
//     config: {
//       endpoint: 'https://xxx.apps.astra.datastax.com',
//       token: 'AstraCS:...',
//       collectionName: 'vectors',
//     },
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured client
//   const store = new AstraStoreAdapter({ client: astraCollection })
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

export interface AstraStoreConfig {
  /** Astra DB API endpoint */
  endpoint: string;
  /** Application token */
  token: string;
  /** Collection name */
  collectionName: string;
  /** Keyspace (optional) */
  keyspace?: string;
}

export interface AstraStoreOptions {
  /** Pre-configured Astra DB collection client */
  client?: any;
  /** Config to create a client internally */
  config?: AstraStoreConfig;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class AstraStoreAdapter implements VectorStorePort {
  private collection: any;
  private db: any;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: AstraStoreOptions;

  constructor(options: AstraStoreOptions) {
    this.options = options;
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.collection = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.collection) {
      if (!this.options.config) {
        throw new Error("AstraStoreAdapter: either client or config is required");
      }
      const astra = await import("@datastax/astra-db-ts");
      const DataAPIClient = astra.DataAPIClient ?? (astra as any).default?.DataAPIClient;
      const client = new DataAPIClient(this.options.config.token);
      this.db = client.db(this.options.config.endpoint, {
        keyspace: this.options.config.keyspace,
      });

      try {
        this.collection = await this.db.createCollection(this.options.config.collectionName, {
          vector: { dimension: this.dimensions, metric: "cosine" },
        });
      } catch {
        this.collection = this.db.collection(this.options.config.collectionName);
      }
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const docs = batch.map((doc) => ({
        _id: doc.id,
        $vector: doc.embedding,
        content: doc.content,
        metadata: doc.metadata,
      }));
      await this.collection.insertMany(docs, { ordered: false });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const findOptions: Record<string, unknown> = {
      sort: { $vector: params.embedding },
      limit: params.topK,
      includeSimilarity: true,
    };

    let filterObj: Record<string, unknown> = {};
    if (params.filter) {
      filterObj = this.translateFilter(params.filter);
    }

    if (!params.includeEmbeddings) {
      findOptions.projection = { $vector: 0 };
    }

    const cursor = await this.collection.find(filterObj, findOptions);
    const docs = await cursor.toArray();

    let results: VectorSearchResult[] = docs.map((doc: any) => ({
      id: String(doc._id),
      content: doc.content ?? "",
      metadata: doc.metadata ?? {},
      score: doc.$similarity ?? 0,
      ...(params.includeEmbeddings && doc.$vector ? { embedding: doc.$vector } : {}),
    }));

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    await this.collection.deleteMany({ _id: { $in: ids } });
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const count = await this.collection.countDocuments({});
    return {
      totalDocuments: count,
      dimensions: this.dimensions,
      indexType: "astra-db",
    };
  }

  async close(): Promise<void> {
    this.collection = null;
    this.db = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // Astra DB Data API uses MongoDB-like operators natively

  private translateFilter(filter: VectorFilter): Record<string, unknown> {
    if ("$and" in filter) {
      return { $and: (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)) };
    }
    if ("$or" in filter) {
      return { $or: (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)) };
    }
    if ("$not" in filter) {
      const inner = this.translateFilter((filter as { $not: VectorFilter }).$not);
      return { $not: inner };
    }

    const result: Record<string, unknown> = {};
    for (const [field, condition] of Object.entries(filter)) {
      const key = `metadata.${field}`;
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        result[key] = condition;
      } else {
        result[key] = { $eq: condition };
      }
    }
    return result;
  }

  private ensureInitialized(): void {
    if (!this.collection) {
      throw new Error("AstraStoreAdapter: call initialize() before using the adapter");
    }
  }
}
