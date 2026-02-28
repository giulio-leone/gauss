// =============================================================================
// Azure AI Search Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @azure/search-documents (peer dependency)
//
// Usage:
//   const store = new AzureSearchStoreAdapter({
//     config: { endpoint: 'https://xxx.search.windows.net', apiKey: '...', indexName: 'vectors' },
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

export interface AzureSearchStoreConfig {
  /** Azure Cognitive Search endpoint URL */
  endpoint: string;
  /** API key */
  apiKey: string;
  /** Index name */
  indexName: string;
}

export interface AzureSearchStoreOptions {
  /** Pre-configured SearchClient */
  client?: any;
  /** Config to create a client internally */
  config?: AzureSearchStoreConfig;
  /** Index name (overrides config) */
  indexName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class AzureSearchStoreAdapter implements VectorStorePort {
  private client: any;
  private indexClient: any;
  private readonly indexName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: AzureSearchStoreOptions;

  constructor(options: AzureSearchStoreOptions) {
    this.options = options;
    this.indexName = options.indexName ?? options.config?.indexName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("AzureSearchStoreAdapter: either client or config is required");
      }
      const azure = await import("@azure/search-documents");
      const SearchClient = azure.SearchClient ?? (azure as any).default?.SearchClient;
      const AzureKeyCredential = azure.AzureKeyCredential ?? (azure as any).default?.AzureKeyCredential;
      this.client = new SearchClient(
        this.options.config.endpoint,
        this.indexName,
        new AzureKeyCredential(this.options.config.apiKey),
      );
      const SearchIndexClient = azure.SearchIndexClient ?? (azure as any).default?.SearchIndexClient;
      if (SearchIndexClient) {
        this.indexClient = new SearchIndexClient(
          this.options.config.endpoint,
          new AzureKeyCredential(this.options.config.apiKey),
        );
      }
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const azureDocs = batch.map((doc) => ({
        id: doc.id,
        content: doc.content,
        metadata: JSON.stringify(doc.metadata),
        embedding: doc.embedding,
      }));
      await this.client.mergeOrUploadDocuments(azureDocs);
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const searchOptions: Record<string, unknown> = {
      vectorSearchOptions: {
        queries: [
          {
            kind: "vector",
            vector: params.embedding,
            kNearestNeighborsCount: params.topK,
            fields: ["embedding"],
          },
        ],
      },
      top: params.topK,
    };

    if (params.filter) {
      searchOptions.filter = this.translateFilter(params.filter);
    }

    const response = await this.client.search("*", searchOptions);
    const hits: any[] = [];
    for await (const result of response.results) {
      hits.push(result);
    }

    let results: VectorSearchResult[] = hits.map((hit: any) => {
      let metadata: Record<string, unknown> = {};
      try { metadata = JSON.parse(hit.document?.metadata ?? "{}"); } catch { /* empty */ }
      return {
        id: hit.document?.id ?? "",
        content: hit.document?.content ?? "",
        metadata,
        score: hit.score ?? 0,
        ...(params.includeEmbeddings && hit.document?.embedding ? { embedding: hit.document.embedding } : {}),
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

    const docs = ids.map((id) => ({ id }));
    await this.client.deleteDocuments(docs);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const count = await this.client.getDocumentsCount();
    return {
      totalDocuments: count ?? 0,
      dimensions: this.dimensions,
      indexType: "azure-search",
    };
  }

  async close(): Promise<void> {
    this.client = null;
    this.indexClient = null;
  }

  // ─── Filter Translation (OData syntax) ────────────────────────────────

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      const parts = (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f));
      return `(${parts.join(" and ")})`;
    }
    if ("$or" in filter) {
      const parts = (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f));
      return `(${parts.join(" or ")})`;
    }
    if ("$not" in filter) {
      return `not (${this.translateFilter((filter as { $not: VectorFilter }).$not)})`;
    }

    const conditions: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildCondition(field, op, val));
        }
      } else {
        conditions.push(`${field} eq ${this.odataLiteral(condition)}`);
      }
    }
    return conditions.join(" and ");
  }

  private buildCondition(field: string, op: string, val: unknown): string {
    switch (op) {
      case "$eq": return `${field} eq ${this.odataLiteral(val)}`;
      case "$ne": return `${field} ne ${this.odataLiteral(val)}`;
      case "$gt": return `${field} gt ${this.odataLiteral(val)}`;
      case "$gte": return `${field} ge ${this.odataLiteral(val)}`;
      case "$lt": return `${field} lt ${this.odataLiteral(val)}`;
      case "$lte": return `${field} le ${this.odataLiteral(val)}`;
      case "$in": {
        const items = (val as unknown[]).map((v) => `${field} eq ${this.odataLiteral(v)}`);
        return `(${items.join(" or ")})`;
      }
      case "$nin": {
        const items = (val as unknown[]).map((v) => `${field} ne ${this.odataLiteral(v)}`);
        return `(${items.join(" and ")})`;
      }
      default: return `${field} eq ${this.odataLiteral(val)}`;
    }
  }

  private odataLiteral(val: unknown): string {
    if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
    if (typeof val === "boolean") return val ? "true" : "false";
    if (val === null || val === undefined) return "null";
    return String(val);
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("AzureSearchStoreAdapter: call initialize() before using the adapter");
    }
  }
}
