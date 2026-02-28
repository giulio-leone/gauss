// =============================================================================
// Turbopuffer Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @turbopuffer/turbopuffer (peer dependency)
//
// Usage:
//   import { TurbopufferStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new TurbopufferStoreAdapter({
//     config: { apiKey: 'tpuf-...', namespace: 'my-namespace' },
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured namespace client
//   const store = new TurbopufferStoreAdapter({ client: tpufNamespace })
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

export interface TurbopufferStoreConfig {
  /** Turbopuffer API key */
  apiKey: string;
  /** Namespace */
  namespace: string;
}

export interface TurbopufferStoreOptions {
  /** Pre-configured Turbopuffer namespace client */
  client?: any;
  /** Config to create a client internally */
  config?: TurbopufferStoreConfig;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class TurbopufferStoreAdapter implements VectorStorePort {
  private ns: any;
  private tpuf: any;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: TurbopufferStoreOptions;

  constructor(options: TurbopufferStoreOptions) {
    this.options = options;
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.ns = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.ns) {
      if (!this.options.config) {
        throw new Error("TurbopufferStoreAdapter: either client or config is required");
      }
      const tpuf = await import("@turbopuffer/turbopuffer");
      const Turbopuffer = tpuf.Turbopuffer ?? (tpuf as any).default?.Turbopuffer;
      this.tpuf = new Turbopuffer({ apiKey: this.options.config.apiKey });
      this.ns = this.tpuf.namespace(this.options.config.namespace);
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      await this.ns.upsert({
        ids: batch.map((d) => d.id),
        vectors: batch.map((d) => d.embedding),
        attributes: Object.fromEntries(
          batch.map((d, idx) => [
            idx.toString(),
            { ...d.metadata, _content: d.content },
          ]).flatMap(([, attrs]) => {
            // Transpose row-based to column-based for Turbopuffer
            return Object.entries(attrs as Record<string, unknown>);
          }),
        ),
      });
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const queryParams: Record<string, unknown> = {
      vector: params.embedding,
      top_k: params.topK,
      include_vectors: params.includeEmbeddings ?? false,
      include_attributes: true,
    };

    if (params.filter) {
      queryParams.filters = this.translateFilter(params.filter);
    }

    const response = await this.ns.query(queryParams);

    let results: VectorSearchResult[] = (response ?? []).map((match: any) => {
      const { _content, ...metadata } = match.attributes ?? {};
      return {
        id: String(match.id),
        content: (_content as string) ?? "",
        metadata,
        score: match.dist != null ? 1 - match.dist : (match.score ?? 0),
        ...(params.includeEmbeddings && match.vector ? { embedding: match.vector } : {}),
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

    await this.ns.deleteByIds(ids);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const info = await this.ns.describe();
    return {
      totalDocuments: info.approx_count ?? 0,
      dimensions: info.dimensions ?? this.dimensions,
      indexType: "turbopuffer",
    };
  }

  async close(): Promise<void> {
    this.ns = null;
    this.tpuf = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // Turbopuffer uses array-based filter syntax: [operator, field, value]

  private translateFilter(filter: VectorFilter): unknown[] {
    if ("$and" in filter) {
      return ["And", (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f))];
    }
    if ("$or" in filter) {
      return ["Or", (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f))];
    }
    if ("$not" in filter) {
      return ["Not", this.translateFilter((filter as { $not: VectorFilter }).$not)];
    }

    const conditions: unknown[][] = [];
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildTpufCondition(field, op, val));
        }
      } else {
        conditions.push(["Eq", field, condition]);
      }
    }

    if (conditions.length === 1) return conditions[0];
    return ["And", conditions];
  }

  private buildTpufCondition(field: string, op: string, val: unknown): unknown[] {
    const opMap: Record<string, string> = {
      $eq: "Eq",
      $ne: "NotEq",
      $gt: "Gt",
      $gte: "Gte",
      $lt: "Lt",
      $lte: "Lte",
      $in: "In",
      $nin: "NotIn",
    };
    return [opMap[op] ?? "Eq", field, val];
  }

  private ensureInitialized(): void {
    if (!this.ns) {
      throw new Error("TurbopufferStoreAdapter: call initialize() before using the adapter");
    }
  }
}
