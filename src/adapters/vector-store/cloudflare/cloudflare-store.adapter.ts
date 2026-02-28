// =============================================================================
// Cloudflare Vectorize Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Uses Cloudflare Vectorize REST API.
//
// Usage:
//   import { CloudflareStoreAdapter } from 'gauss'
//
//   // Option A — pass config (REST API)
//   const store = new CloudflareStoreAdapter({
//     config: {
//       accountId: 'abc123',
//       apiToken: 'Bearer ...',
//       indexName: 'my-index',
//     },
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured client (e.g. Workers AI binding)
//   const store = new CloudflareStoreAdapter({ client: env.VECTORIZE })
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

export interface CloudflareStoreConfig {
  /** Cloudflare account ID */
  accountId: string;
  /** Cloudflare API token */
  apiToken: string;
  /** Vectorize index name */
  indexName: string;
}

export interface CloudflareStoreOptions {
  /** Pre-configured Vectorize binding (Workers environment) */
  client?: any;
  /** Config for REST API access */
  config?: CloudflareStoreConfig;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class CloudflareStoreAdapter implements VectorStorePort {
  private binding: any;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: CloudflareStoreOptions;
  private baseUrl: string = "";

  constructor(options: CloudflareStoreOptions) {
    this.options = options;
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.binding = options.client;
  }

  async initialize(): Promise<void> {
    if (this.binding) return;

    if (!this.options.config) {
      throw new Error("CloudflareStoreAdapter: either client or config is required");
    }

    const { accountId, indexName } = this.options.config;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${indexName}`;

    // Create a REST-based binding wrapper
    this.binding = this.createRestBinding();
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const vectors = batch.map((doc) => ({
        id: doc.id,
        values: doc.embedding,
        metadata: { ...doc.metadata, _content: doc.content },
      }));
      await this.binding.upsert(vectors);
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const queryParams: Record<string, unknown> = {
      vector: params.embedding,
      topK: params.topK,
      returnValues: params.includeEmbeddings ?? false,
      returnMetadata: "all",
    };

    if (params.filter) {
      queryParams.filter = this.translateFilter(params.filter);
    }

    const response = await this.binding.query(queryParams);
    const matches = response.matches ?? [];

    let results: VectorSearchResult[] = matches.map((match: any) => {
      const { _content, ...metadata } = match.metadata ?? {};
      return {
        id: String(match.id),
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

    await this.binding.deleteByIds(ids);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const info = await this.binding.describe();
    return {
      totalDocuments: info.vectorsCount ?? 0,
      dimensions: info.dimensions ?? this.dimensions,
      indexType: "cloudflare-vectorize",
    };
  }

  async close(): Promise<void> {
    this.binding = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // Cloudflare Vectorize uses a flat JSON filter object

  private translateFilter(filter: VectorFilter): Record<string, unknown> {
    if ("$and" in filter) {
      const merged: Record<string, unknown> = {};
      for (const f of (filter as { $and: VectorFilter[] }).$and) {
        Object.assign(merged, this.translateFilter(f));
      }
      return merged;
    }
    if ("$or" in filter) {
      // Vectorize doesn't natively support $or — flatten best-effort
      const merged: Record<string, unknown> = {};
      for (const f of (filter as { $or: VectorFilter[] }).$or) {
        Object.assign(merged, this.translateFilter(f));
      }
      return merged;
    }
    if ("$not" in filter) {
      const inner = this.translateFilter((filter as { $not: VectorFilter }).$not);
      const negated: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(inner)) {
        if (typeof val === "object" && val !== null) {
          const ops = val as Record<string, unknown>;
          const neg: Record<string, unknown> = {};
          for (const [op, v] of Object.entries(ops)) {
            const opMap: Record<string, string> = {
              $eq: "$ne", $ne: "$eq", $gt: "$lte", $gte: "$lt",
              $lt: "$gte", $lte: "$gt", $in: "$nin", $nin: "$in",
            };
            neg[opMap[op] ?? op] = v;
          }
          negated[key] = neg;
        } else {
          negated[key] = { $ne: val };
        }
      }
      return negated;
    }

    const result: Record<string, unknown> = {};
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        result[field] = condition;
      } else {
        result[field] = { $eq: condition };
      }
    }
    return result;
  }

  // ─── REST Binding ─────────────────────────────────────────────────────

  private createRestBinding(): Record<string, Function> {
    const apiToken = this.options.config!.apiToken;
    const baseUrl = this.baseUrl;

    const request = async (path: string, method: string, body?: unknown) => {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(`Cloudflare API error: ${JSON.stringify(json.errors)}`);
      }
      return json.result;
    };

    return {
      upsert: (vectors: unknown[]) => request("/vectors", "POST", { vectors }),
      query: (params: unknown) => request("/query", "POST", params),
      deleteByIds: (ids: string[]) => request("/vectors", "DELETE", { ids }),
      describe: () => request("", "GET"),
    };
  }

  private ensureInitialized(): void {
    if (!this.binding) {
      throw new Error("CloudflareStoreAdapter: call initialize() before using the adapter");
    }
  }
}
