// =============================================================================
// Elasticsearch Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @elastic/elasticsearch (peer dependency)
//
// Usage:
//   import { ElasticsearchStoreAdapter } from 'gauss'
//
//   // Option A — pass config (client created internally)
//   const store = new ElasticsearchStoreAdapter({
//     config: { node: 'http://localhost:9200', indexName: 'my-index' },
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured client
//   import { Client } from '@elastic/elasticsearch'
//   const client = new Client({ node: 'http://localhost:9200' })
//   const store = new ElasticsearchStoreAdapter({ client, indexName: 'my-index' })
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

export interface ElasticsearchStoreConfig {
  /** Elasticsearch node URL */
  node: string;
  /** Authentication options */
  auth?: {
    apiKey?: string;
    username?: string;
    password?: string;
  };
  /** Index name */
  indexName: string;
}

export interface ElasticsearchStoreOptions {
  /** Pre-configured Elasticsearch client */
  client?: any;
  /** Config to create a client internally */
  config?: ElasticsearchStoreConfig;
  /** Index name (overrides config.indexName if both provided) */
  indexName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class ElasticsearchStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly indexName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: ElasticsearchStoreOptions;

  constructor(options: ElasticsearchStoreOptions) {
    this.options = options;
    this.indexName = options.indexName ?? options.config?.indexName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("ElasticsearchStoreAdapter: either client or config.node is required");
      }
      const es = await import("@elastic/elasticsearch");
      const Client = es.Client ?? (es as any).default?.Client;
      const clientOpts: Record<string, unknown> = { node: this.options.config.node };
      if (this.options.config.auth) {
        const { apiKey, username, password } = this.options.config.auth;
        if (apiKey) clientOpts.auth = { apiKey };
        else if (username && password) clientOpts.auth = { username, password };
      }
      this.client = new Client(clientOpts);
    }

    const exists = await this.client.indices.exists({ index: this.indexName });
    if (!exists) {
      await this.client.indices.create({
        index: this.indexName,
        body: {
          mappings: {
            properties: {
              embedding: { type: "dense_vector", dims: this.dimensions, index: true, similarity: "cosine" },
              content: { type: "text" },
              metadata: { type: "object", enabled: true },
            },
          },
        },
      });
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const body: unknown[] = [];
      for (const doc of batch) {
        body.push({ index: { _index: this.indexName, _id: doc.id } });
        body.push({ embedding: doc.embedding, content: doc.content, metadata: doc.metadata });
      }
      await this.client.bulk({ body, refresh: true });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const knn: Record<string, unknown> = {
      field: "embedding",
      query_vector: params.embedding,
      k: params.topK,
      num_candidates: params.topK * 2,
    };

    if (params.filter) {
      knn.filter = this.translateFilter(params.filter);
    }

    const response = await this.client.search({
      index: this.indexName,
      body: {
        knn,
        size: params.topK,
        _source: params.includeEmbeddings
          ? ["content", "metadata", "embedding"]
          : ["content", "metadata"],
      },
    });

    const hits = response.hits?.hits ?? [];
    let results: VectorSearchResult[] = hits.map((hit: any) => ({
      id: hit._id,
      content: hit._source?.content ?? "",
      metadata: hit._source?.metadata ?? {},
      score: hit._score ?? 0,
      ...(params.includeEmbeddings && hit._source?.embedding ? { embedding: hit._source.embedding } : {}),
    }));

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    const body = ids.map((id) => ({ delete: { _index: this.indexName, _id: id } }));
    await this.client.bulk({ body, refresh: true });
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const stats = await this.client.count({ index: this.indexName });
    return {
      totalDocuments: stats.count ?? 0,
      dimensions: this.dimensions,
      indexType: "elasticsearch",
    };
  }

  async close(): Promise<void> {
    if (this.client?.close) await this.client.close();
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): Record<string, unknown> {
    if ("$and" in filter) {
      return {
        bool: {
          must: (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)),
        },
      };
    }
    if ("$or" in filter) {
      return {
        bool: {
          should: (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)),
          minimum_should_match: 1,
        },
      };
    }
    if ("$not" in filter) {
      return {
        bool: {
          must_not: [this.translateFilter((filter as { $not: VectorFilter }).$not)],
        },
      };
    }

    const must: Record<string, unknown>[] = [];

    for (const [field, condition] of Object.entries(filter)) {
      const key = `metadata.${field}`;
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          must.push(this.buildEsCondition(key, op, val));
        }
      } else {
        must.push({ term: { [key]: condition } });
      }
    }

    return must.length === 1 ? must[0] : { bool: { must } };
  }

  private buildEsCondition(field: string, op: string, val: unknown): Record<string, unknown> {
    switch (op) {
      case "$eq":
        return { term: { [field]: val } };
      case "$ne":
        return { bool: { must_not: [{ term: { [field]: val } }] } };
      case "$gt":
        return { range: { [field]: { gt: val } } };
      case "$gte":
        return { range: { [field]: { gte: val } } };
      case "$lt":
        return { range: { [field]: { lt: val } } };
      case "$lte":
        return { range: { [field]: { lte: val } } };
      case "$in":
        return { terms: { [field]: val } };
      case "$nin":
        return { bool: { must_not: [{ terms: { [field]: val } }] } };
      default:
        return { term: { [field]: val } };
    }
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("ElasticsearchStoreAdapter: call initialize() before using the adapter");
    }
  }
}
