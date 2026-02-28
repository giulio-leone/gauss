// =============================================================================
// Pinecone Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @pinecone-database/pinecone (peer dependency)
//
// Usage:
//   import { PineconeStoreAdapter } from 'gauss'
//
//   // Option A — pass config (client created internally)
//   const store = new PineconeStoreAdapter({
//     apiKey: 'pk-...',
//     indexName: 'my-index',
//     namespace: 'default',
//     dimensions: 1536,
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured client
//   import { Pinecone } from '@pinecone-database/pinecone'
//   const client = new Pinecone({ apiKey: 'pk-...' })
//   const store = new PineconeStoreAdapter({ client, indexName: 'my-index' })
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

export interface PineconeStoreConfig {
  apiKey: string;
}

export interface PineconeStoreOptions {
  /** Pre-configured Pinecone client (takes precedence over config) */
  client?: any;
  /** Config to create a client internally */
  config?: PineconeStoreConfig;
  /** Pinecone index name */
  indexName: string;
  /** Namespace within the index (default: '') */
  namespace?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert operations (default: 100) */
  batchSize?: number;
}

export class PineconeStoreAdapter implements VectorStorePort {
  private client: any;
  private index: any;
  private readonly indexName: string;
  private readonly namespace: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: PineconeStoreOptions;

  constructor(options: PineconeStoreOptions) {
    this.options = options;
    this.indexName = options.indexName;
    this.namespace = options.namespace ?? "";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  /** Initialize the adapter — creates client if needed and resolves index */
  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("PineconeStoreAdapter: either client or config.apiKey is required");
      }
      const pinecone = await import("@pinecone-database/pinecone");
      const Pinecone = pinecone.Pinecone ?? (pinecone as any).default?.Pinecone;
      this.client = new Pinecone({ apiKey: this.options.config.apiKey });
    }
    this.index = this.client.index(this.indexName);
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    const ns = this.index.namespace(this.namespace);
    const vectors = documents.map((doc) => ({
      id: doc.id,
      values: doc.embedding,
      metadata: { ...doc.metadata, _content: doc.content },
    }));

    for (let i = 0; i < vectors.length; i += this.batchSize) {
      const batch = vectors.slice(i, i + this.batchSize);
      await ns.upsert(batch);
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const ns = this.index.namespace(this.namespace);
    const queryParams: Record<string, unknown> = {
      vector: params.embedding,
      topK: params.topK,
      includeMetadata: true,
      includeValues: params.includeEmbeddings ?? false,
    };

    if (params.filter) {
      queryParams.filter = this.translateFilter(params.filter);
    }

    const response = await ns.query(queryParams);

    let results: VectorSearchResult[] = (response.matches ?? []).map((match: any) => {
      const { _content, ...metadata } = match.metadata ?? {};
      return {
        id: match.id,
        content: (_content as string) ?? "",
        metadata,
        score: match.score ?? 0,
        ...(params.includeEmbeddings && match.values ? { embedding: match.values } : {}),
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

    const ns = this.index.namespace(this.namespace);
    await ns.deleteMany(ids);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const stats = await this.index.describeIndexStats();
    const nsStats = stats.namespaces?.[this.namespace || ""] ?? stats.namespaces?.[""] ?? {};
    return {
      totalDocuments: nsStats.recordCount ?? stats.totalRecordCount ?? 0,
      dimensions: stats.dimension ?? this.dimensions,
      indexType: "pinecone",
    };
  }

  /** Close / dispose (no-op for Pinecone — stateless HTTP client) */
  async close(): Promise<void> {
    this.index = null;
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): Record<string, unknown> {
    if ("$and" in filter) {
      return { $and: (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)) };
    }
    if ("$or" in filter) {
      return { $or: (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)) };
    }
    if ("$not" in filter) {
      // Pinecone doesn't support $not directly — wrap via $and + negated ops
      const inner = this.translateFilter((filter as { $not: VectorFilter }).$not);
      return this.negateFilter(inner);
    }

    const result: Record<string, unknown> = {};
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          result[field] = { ...((result[field] as Record<string, unknown>) ?? {}), [op]: val };
        }
      } else {
        result[field] = { $eq: condition };
      }
    }
    return result;
  }

  private negateFilter(filter: Record<string, unknown>): Record<string, unknown> {
    const negated: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(filter)) {
      if (key === "$and" || key === "$or") {
        negated[key === "$and" ? "$or" : "$and"] = (val as Record<string, unknown>[]).map((f) =>
          this.negateFilter(f),
        );
      } else if (val !== null && typeof val === "object") {
        const ops = val as Record<string, unknown>;
        const neg: Record<string, unknown> = {};
        for (const [op, v] of Object.entries(ops)) {
          const opMap: Record<string, string> = {
            $eq: "$ne", $ne: "$eq", $gt: "$lte", $gte: "$lt", $lt: "$gte", $lte: "$gt",
            $in: "$nin", $nin: "$in",
          };
          neg[opMap[op] ?? op] = v;
        }
        negated[key] = neg;
      }
    }
    return negated;
  }

  private ensureInitialized(): void {
    if (!this.index) {
      throw new Error("PineconeStoreAdapter: call initialize() before using the adapter");
    }
  }
}
