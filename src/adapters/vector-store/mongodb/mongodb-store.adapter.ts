// =============================================================================
// MongoDB Atlas Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: mongodb (peer dependency)
//
// Usage:
//   import { MongoDBStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new MongoDBStoreAdapter({
//     config: {
//       connectionString: 'mongodb+srv://...',
//       databaseName: 'mydb',
//       collectionName: 'vectors',
//     },
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured MongoClient
//   import { MongoClient } from 'mongodb'
//   const client = new MongoClient('mongodb+srv://...')
//   const store = new MongoDBStoreAdapter({
//     client,
//     databaseName: 'mydb',
//     collectionName: 'vectors',
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

export interface MongoDBStoreConfig {
  /** MongoDB connection string */
  connectionString: string;
  /** Database name */
  databaseName: string;
  /** Collection name */
  collectionName: string;
}

export interface MongoDBStoreOptions {
  /** Pre-configured MongoClient */
  client?: any;
  /** Config to create a client internally */
  config?: MongoDBStoreConfig;
  /** Database name (overrides config) */
  databaseName?: string;
  /** Collection name (overrides config) */
  collectionName?: string;
  /** Atlas search index name (default: 'vector_index') */
  indexName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class MongoDBStoreAdapter implements VectorStorePort {
  private client: any;
  private collection: any;
  private readonly databaseName: string;
  private readonly collectionName: string;
  private readonly indexName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: MongoDBStoreOptions;

  constructor(options: MongoDBStoreOptions) {
    this.options = options;
    this.databaseName = options.databaseName ?? options.config?.databaseName ?? "default";
    this.collectionName = options.collectionName ?? options.config?.collectionName ?? "vectors";
    this.indexName = options.indexName ?? "vector_index";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("MongoDBStoreAdapter: either client or config.connectionString is required");
      }
      const mongodb = await import("mongodb");
      const MongoClient = mongodb.MongoClient ?? (mongodb as any).default?.MongoClient;
      this.client = new MongoClient(this.options.config.connectionString);
      await this.client.connect();
    }

    const db = this.client.db(this.databaseName);
    this.collection = db.collection(this.collectionName);
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const ops = batch.map((doc) => ({
        updateOne: {
          filter: { _id: doc.id },
          update: {
            $set: {
              embedding: doc.embedding,
              content: doc.content,
              metadata: doc.metadata,
            },
          },
          upsert: true,
        },
      }));
      await this.collection.bulkWrite(ops);
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const pipeline: Record<string, unknown>[] = [];

    const vectorSearch: Record<string, unknown> = {
      index: this.indexName,
      path: "embedding",
      queryVector: params.embedding,
      numCandidates: params.topK * 10,
      limit: params.topK,
    };

    if (params.filter) {
      vectorSearch.filter = this.translateFilter(params.filter);
    }

    pipeline.push({ $vectorSearch: vectorSearch });

    pipeline.push({
      $project: {
        _id: 1,
        content: 1,
        metadata: 1,
        score: { $meta: "vectorSearchScore" },
        ...(params.includeEmbeddings ? { embedding: 1 } : {}),
      },
    });

    const cursor = await this.collection.aggregate(pipeline);
    const docs = await cursor.toArray();

    let results: VectorSearchResult[] = docs.map((doc: any) => ({
      id: String(doc._id),
      content: doc.content ?? "",
      metadata: doc.metadata ?? {},
      score: doc.score ?? 0,
      ...(params.includeEmbeddings && doc.embedding ? { embedding: doc.embedding } : {}),
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

    const count = await this.collection.countDocuments();
    return {
      totalDocuments: count,
      dimensions: this.dimensions,
      indexType: "mongodb-atlas",
    };
  }

  async close(): Promise<void> {
    if (this.client?.close) await this.client.close();
    this.client = null;
    this.collection = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // MongoDB Atlas Vector Search uses native MongoDB query operators,
  // so the translation is mostly pass-through with field prefixing.

  private translateFilter(filter: VectorFilter): Record<string, unknown> {
    if ("$and" in filter) {
      return { $and: (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)) };
    }
    if ("$or" in filter) {
      return { $or: (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)) };
    }
    if ("$not" in filter) {
      const inner = this.translateFilter((filter as { $not: VectorFilter }).$not);
      return { $nor: [inner] };
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
      throw new Error("MongoDBStoreAdapter: call initialize() before using the adapter");
    }
  }
}
