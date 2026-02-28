// =============================================================================
// Momento Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @gomomento/sdk (peer dependency)
//
// Usage:
//   const store = new MomentoStoreAdapter({
//     config: { apiKey: '...', indexName: 'my-index' },
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

export interface MomentoStoreConfig {
  /** Momento API key */
  apiKey: string;
  /** Index name */
  indexName: string;
}

export interface MomentoStoreOptions {
  /** Pre-configured Momento client */
  client?: any;
  /** Config to create a client internally */
  config?: MomentoStoreConfig;
  /** Index name (overrides config) */
  indexName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class MomentoStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly indexName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: MomentoStoreOptions;

  constructor(options: MomentoStoreOptions) {
    this.options = options;
    this.indexName = options.indexName ?? options.config?.indexName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("MomentoStoreAdapter: either client or config.apiKey is required");
      }
      const momento = await import("@gomomento/sdk");
      const PreviewVectorIndexClient =
        momento.PreviewVectorIndexClient ??
        (momento as any).default?.PreviewVectorIndexClient;
      const CredentialProvider =
        momento.CredentialProvider ?? (momento as any).default?.CredentialProvider;
      this.client = new PreviewVectorIndexClient({
        credentialProvider: CredentialProvider.fromString({
          apiKey: this.options.config.apiKey,
        }),
      });
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const items = batch.map((doc) => ({
        id: doc.id,
        vector: doc.embedding,
        metadata: { ...doc.metadata, _content: doc.content },
      }));
      await this.client.upsertItemBatch(this.indexName, items);
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const searchParams: Record<string, unknown> = {
      topK: params.topK,
    };

    if (params.filter) {
      searchParams.metadataFields = this.getFilterFields(params.filter);
    }

    const response = await this.client.search(this.indexName, params.embedding, searchParams);
    const hits = response.hits ?? response.results ?? [];

    let results: VectorSearchResult[] = hits.map((hit: any) => {
      const { _content, ...metadata } = hit.metadata ?? {};
      return {
        id: hit.id ?? "",
        content: (_content as string) ?? "",
        metadata,
        score: hit.score ?? hit.distance ?? 0,
        ...(params.includeEmbeddings && hit.vector ? { embedding: hit.vector } : {}),
      };
    });

    if (params.filter) {
      results = results.filter((r) => this.matchesFilter(r.metadata, params.filter!));
    }

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    await this.client.deleteItemBatch(this.indexName, ids);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const info = await this.client.listIndexes();
    const idx = (info.indexes ?? []).find((i: any) => i.name === this.indexName);

    return {
      totalDocuments: idx?.numItems ?? 0,
      dimensions: idx?.numDimensions ?? this.dimensions,
      indexType: "momento",
    };
  }

  async close(): Promise<void> {
    if (this.client?.close) await this.client.close();
    this.client = null;
  }

  // ─── Filter helpers ───────────────────────────────────────────────────

  private getFilterFields(filter: VectorFilter): string[] {
    const fields = new Set<string>();
    const extract = (f: VectorFilter) => {
      if ("$and" in f) (f as { $and: VectorFilter[] }).$and.forEach(extract);
      else if ("$or" in f) (f as { $or: VectorFilter[] }).$or.forEach(extract);
      else if ("$not" in f) extract((f as { $not: VectorFilter }).$not);
      else Object.keys(f).forEach((k) => fields.add(k));
    };
    extract(filter);
    return [...fields];
  }

  private matchesFilter(metadata: Record<string, unknown>, filter: VectorFilter): boolean {
    if ("$and" in filter) {
      return (filter as { $and: VectorFilter[] }).$and.every((f) => this.matchesFilter(metadata, f));
    }
    if ("$or" in filter) {
      return (filter as { $or: VectorFilter[] }).$or.some((f) => this.matchesFilter(metadata, f));
    }
    if ("$not" in filter) {
      return !this.matchesFilter(metadata, (filter as { $not: VectorFilter }).$not);
    }

    for (const [field, condition] of Object.entries(filter)) {
      const val = metadata[field];
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, expected] of Object.entries(condition as Record<string, unknown>)) {
          if (!this.evalOp(val, op, expected)) return false;
        }
      } else {
        if (val !== condition) return false;
      }
    }
    return true;
  }

  private evalOp(val: unknown, op: string, expected: unknown): boolean {
    switch (op) {
      case "$eq": return val === expected;
      case "$ne": return val !== expected;
      case "$gt": return (val as number) > (expected as number);
      case "$gte": return (val as number) >= (expected as number);
      case "$lt": return (val as number) < (expected as number);
      case "$lte": return (val as number) <= (expected as number);
      case "$in": return (expected as unknown[]).includes(val);
      case "$nin": return !(expected as unknown[]).includes(val);
      default: return val === expected;
    }
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("MomentoStoreAdapter: call initialize() before using the adapter");
    }
  }
}
