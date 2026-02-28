// =============================================================================
// Vespa Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// REST API-based adapter for Vespa vector search engine.
// No SDK required — uses native fetch.
//
// Usage:
//   const store = new VespaStoreAdapter({
//     config: { endpoint: 'http://localhost:8080' },
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

export interface VespaStoreConfig {
  /** Vespa endpoint URL */
  endpoint: string;
  /** Application package / schema (default: 'vectors') */
  applicationPackage?: string;
}

export interface VespaStoreOptions {
  /** Pre-configured HTTP client (must have fetch-like interface) */
  client?: any;
  /** Config to create adapter */
  config?: VespaStoreConfig;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class VespaStoreAdapter implements VectorStorePort {
  private client: any;
  private endpoint: string = "";
  private schema: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: VespaStoreOptions;

  constructor(options: VespaStoreOptions) {
    this.options = options;
    this.schema = options.config?.applicationPackage ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("VespaStoreAdapter: either client or config.endpoint is required");
      }
      this.endpoint = this.options.config.endpoint.replace(/\/$/, "");
      this.client = { fetch: globalThis.fetch.bind(globalThis) };
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      for (const doc of batch) {
        const url = `${this.endpoint}/document/v1/${this.schema}/${this.schema}/docid/${encodeURIComponent(doc.id)}`;
        await this.client.fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              embedding: doc.embedding,
              content: doc.content,
              metadata: doc.metadata,
            },
          }),
        });
      }
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const yql = `select * from sources ${this.schema} where {targetHits:${params.topK}}nearestNeighbor(embedding, q)`;
    const body: Record<string, unknown> = {
      yql,
      "ranking.features.query(q)": params.embedding,
      hits: params.topK,
    };

    if (params.filter) {
      body.filter = this.translateFilter(params.filter);
    }

    const url = `${this.endpoint}/search/`;
    const response = await this.client.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = typeof response.json === "function" ? await response.json() : response;
    const hits = data.root?.children ?? [];

    let results: VectorSearchResult[] = hits.map((hit: any) => ({
      id: hit.id ?? hit.fields?.id ?? "",
      content: hit.fields?.content ?? "",
      metadata: hit.fields?.metadata ?? {},
      score: hit.relevance ?? 0,
      ...(params.includeEmbeddings && hit.fields?.embedding ? { embedding: hit.fields.embedding } : {}),
    }));

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    for (const id of ids) {
      const url = `${this.endpoint}/document/v1/${this.schema}/${this.schema}/docid/${encodeURIComponent(id)}`;
      await this.client.fetch(url, { method: "DELETE" });
    }
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const url = `${this.endpoint}/document/v1/${this.schema}/${this.schema}/docid/?wantedDocumentCount=0`;
    const response = await this.client.fetch(url);
    const data = typeof response.json === "function" ? await response.json() : response;

    return {
      totalDocuments: data.documentCount ?? 0,
      dimensions: this.dimensions,
      indexType: "vespa",
    };
  }

  async close(): Promise<void> {
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      return (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)).join(" AND ");
    }
    if ("$or" in filter) {
      return `(${(filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)).join(" OR ")})`;
    }
    if ("$not" in filter) {
      return `!(${this.translateFilter((filter as { $not: VectorFilter }).$not)})`;
    }

    const parts: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          parts.push(this.buildVespaCondition(field, op, val));
        }
      } else {
        parts.push(`metadata.${field} = ${this.vespaLiteral(condition)}`);
      }
    }
    return parts.join(" AND ");
  }

  private buildVespaCondition(field: string, op: string, val: unknown): string {
    const f = `metadata.${field}`;
    switch (op) {
      case "$eq": return `${f} = ${this.vespaLiteral(val)}`;
      case "$ne": return `${f} != ${this.vespaLiteral(val)}`;
      case "$gt": return `${f} > ${this.vespaLiteral(val)}`;
      case "$gte": return `${f} >= ${this.vespaLiteral(val)}`;
      case "$lt": return `${f} < ${this.vespaLiteral(val)}`;
      case "$lte": return `${f} <= ${this.vespaLiteral(val)}`;
      case "$in": {
        const items = (val as unknown[]).map((v) => `${f} = ${this.vespaLiteral(v)}`);
        return `(${items.join(" OR ")})`;
      }
      case "$nin": {
        const items = (val as unknown[]).map((v) => `${f} != ${this.vespaLiteral(v)}`);
        return `(${items.join(" AND ")})`;
      }
      default: return `${f} = ${this.vespaLiteral(val)}`;
    }
  }

  private vespaLiteral(val: unknown): string {
    if (typeof val === "string") return `"${val.replace(/"/g, '\\"')}"`;
    return String(val);
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("VespaStoreAdapter: call initialize() before using the adapter");
    }
  }
}
