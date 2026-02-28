// =============================================================================
// ChromaDB Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: chromadb (peer dependency)
//
// Usage:
//   import { ChromaStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new ChromaStoreAdapter({
//     config: { path: 'http://localhost:8000' },
//     collectionName: 'my-collection',
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured ChromaClient
//   import { ChromaClient } from 'chromadb'
//   const client = new ChromaClient({ path: 'http://localhost:8000' })
//   const store = new ChromaStoreAdapter({ client, collectionName: 'my-collection' })
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

export interface ChromaStoreConfig {
  /** Chroma server URL or local path */
  path?: string;
  /** Chroma server URL (alias for path for remote servers) */
  url?: string;
}

export interface ChromaStoreOptions {
  /** Pre-configured ChromaClient */
  client?: any;
  /** Config to create a client internally */
  config?: ChromaStoreConfig;
  /** Collection name */
  collectionName: string;
  /** Embedding dimensions (used for stats reporting, default: 1536) */
  dimensions?: number;
  /** Distance function (default: 'cosine') */
  distanceFunction?: "cosine" | "l2" | "ip";
}

export class ChromaStoreAdapter implements VectorStorePort {
  private client: any;
  private collection: any;
  private readonly collectionName: string;
  private readonly dimensions: number;
  private readonly distanceFunction: string;
  private readonly options: ChromaStoreOptions;

  constructor(options: ChromaStoreOptions) {
    this.options = options;
    this.collectionName = options.collectionName;
    this.dimensions = options.dimensions ?? 1536;
    this.distanceFunction = options.distanceFunction ?? "cosine";
    if (options.client) this.client = options.client;
  }

  /** Initialize — create client and get/create collection */
  async initialize(): Promise<void> {
    if (!this.client) {
      const chromadb = await import("chromadb");
      const ChromaClient = chromadb.ChromaClient ?? (chromadb as any).default?.ChromaClient;
      const path = this.options.config?.url ?? this.options.config?.path;
      this.client = new ChromaClient(path ? { path } : undefined);
    }

    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      metadata: { "hnsw:space": this.distanceFunction },
    });
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    await this.collection.upsert({
      ids: documents.map((d) => d.id),
      embeddings: documents.map((d) => d.embedding),
      documents: documents.map((d) => d.content),
      metadatas: documents.map((d) => d.metadata),
    });
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const queryParams: Record<string, unknown> = {
      queryEmbeddings: [params.embedding],
      nResults: params.topK,
      include: ["documents", "metadatas", "distances"],
    };

    if (params.includeEmbeddings) {
      (queryParams.include as string[]).push("embeddings");
    }

    if (params.filter) {
      queryParams.where = this.translateFilter(params.filter);
    }

    const response = await this.collection.query(queryParams);

    const ids: string[] = response.ids?.[0] ?? [];
    const documents: (string | null)[] = response.documents?.[0] ?? [];
    const metadatas: (Record<string, unknown> | null)[] = response.metadatas?.[0] ?? [];
    const distances: (number | null)[] = response.distances?.[0] ?? [];
    const embeddings: (number[] | null)[] | undefined = response.embeddings?.[0];

    let results: VectorSearchResult[] = ids.map((id, i) => {
      const distance = distances[i] ?? 1;
      // Chroma returns distances: for cosine, score = 1 - distance
      const score = this.distanceFunction === "cosine" ? 1 - distance : 1 / (1 + distance);
      return {
        id,
        content: documents[i] ?? "",
        metadata: metadatas[i] ?? {},
        score,
        ...(params.includeEmbeddings && embeddings?.[i] ? { embedding: embeddings[i]! } : {}),
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

    await this.collection.delete({ ids });
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const count = await this.collection.count();
    return {
      totalDocuments: count,
      dimensions: this.dimensions,
      indexType: "chroma",
    };
  }

  /** Close the client (no-op for ChromaDB HTTP client) */
  async close(): Promise<void> {
    this.collection = null;
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
      // Chroma supports $not natively at the condition level — wrap conditions
      const inner = this.translateFilter((filter as { $not: VectorFilter }).$not);
      return this.negateChromaFilter(inner);
    }

    const result: Record<string, unknown> = {};
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        // Operator object — Chroma uses same MongoDB-style operators
        result[field] = condition;
      } else {
        result[field] = { $eq: condition };
      }
    }
    return result;
  }

  private negateChromaFilter(filter: Record<string, unknown>): Record<string, unknown> {
    const negated: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(filter)) {
      if (key === "$and") {
        negated["$or"] = (val as Record<string, unknown>[]).map((f) => this.negateChromaFilter(f));
      } else if (key === "$or") {
        negated["$and"] = (val as Record<string, unknown>[]).map((f) => this.negateChromaFilter(f));
      } else if (val !== null && typeof val === "object") {
        const ops = val as Record<string, unknown>;
        const neg: Record<string, unknown> = {};
        const opMap: Record<string, string> = {
          $eq: "$ne", $ne: "$eq", $gt: "$lte", $gte: "$lt", $lt: "$gte", $lte: "$gt",
          $in: "$nin", $nin: "$in",
        };
        for (const [op, v] of Object.entries(ops)) {
          neg[opMap[op] ?? op] = v;
        }
        negated[key] = neg;
      }
    }
    return negated;
  }

  private ensureInitialized(): void {
    if (!this.collection) {
      throw new Error("ChromaStoreAdapter: call initialize() before using the adapter");
    }
  }
}
