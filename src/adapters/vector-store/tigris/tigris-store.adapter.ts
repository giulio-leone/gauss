// =============================================================================
// Tigris Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// REST API-based adapter for Tigris Search.
// No SDK required — uses native fetch.
//
// Usage:
//   const store = new TigrisStoreAdapter({
//     config: { uri: 'https://...', apiKey: '...', indexName: 'vectors' },
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

export interface TigrisStoreConfig {
  /** Tigris URI */
  uri: string;
  /** API key */
  apiKey: string;
  /** Index name */
  indexName: string;
}

export interface TigrisStoreOptions {
  /** Pre-configured HTTP client */
  client?: any;
  /** Config to create adapter */
  config?: TigrisStoreConfig;
  /** Index name (overrides config) */
  indexName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class TigrisStoreAdapter implements VectorStorePort {
  private client: any;
  private baseUrl: string = "";
  private apiKey: string = "";
  private readonly indexName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: TigrisStoreOptions;

  constructor(options: TigrisStoreOptions) {
    this.options = options;
    this.indexName = options.indexName ?? options.config?.indexName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("TigrisStoreAdapter: either client or config is required");
      }
      this.baseUrl = this.options.config.uri.replace(/\/$/, "");
      this.apiKey = this.options.config.apiKey;
      this.client = { fetch: globalThis.fetch.bind(globalThis) };
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const docs = batch.map((doc) => ({
        id: doc.id,
        embedding: doc.embedding,
        content: doc.content,
        metadata: doc.metadata,
      }));
      await this.client.fetch(`${this.baseUrl}/v1/indexes/${encodeURIComponent(this.indexName)}/documents`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ documents: docs }),
      });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const body: Record<string, unknown> = {
      vector: params.embedding,
      k: params.topK,
    };

    if (params.filter) {
      body.filter = this.translateFilter(params.filter);
    }

    const response = await this.client.fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(this.indexName)}/search`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      },
    );

    const data = typeof response.json === "function" ? await response.json() : response;
    const hits = data.results ?? data.hits ?? [];

    let results: VectorSearchResult[] = hits.map((hit: any) => ({
      id: hit.id ?? hit.document?.id ?? "",
      content: hit.content ?? hit.document?.content ?? "",
      metadata: hit.metadata ?? hit.document?.metadata ?? {},
      score: hit.score ?? 0,
      ...(params.includeEmbeddings && (hit.embedding ?? hit.document?.embedding)
        ? { embedding: hit.embedding ?? hit.document.embedding }
        : {}),
    }));

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    await this.client.fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(this.indexName)}/documents/delete`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ ids }),
      },
    );
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const response = await this.client.fetch(
      `${this.baseUrl}/v1/indexes/${encodeURIComponent(this.indexName)}`,
      { headers: this.headers() },
    );
    const data = typeof response.json === "function" ? await response.json() : response;

    return {
      totalDocuments: data.numDocuments ?? data.num_documents ?? 0,
      dimensions: this.dimensions,
      indexType: "tigris",
    };
  }

  async close(): Promise<void> {
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
      return { $not: this.translateFilter((filter as { $not: VectorFilter }).$not) };
    }

    const result: Record<string, unknown> = {};
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        result[`metadata.${field}`] = condition;
      } else {
        result[`metadata.${field}`] = { $eq: condition };
      }
    }
    return result;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("TigrisStoreAdapter: call initialize() before using the adapter");
    }
  }
}
