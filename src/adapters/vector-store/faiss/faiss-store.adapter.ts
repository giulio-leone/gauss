// =============================================================================
// Faiss Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: faiss-node (peer dependency)
//
// CPU-based in-process vector index using Facebook AI Similarity Search.
//
// Usage:
//   const store = new FaissStoreAdapter({ config: { dimensions: 1536 } })
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

export interface FaissStoreConfig {
  /** Embedding dimensions */
  dimensions: number;
  /** Index type (default: 'flat') */
  indexType?: "flat" | "ivf";
}

export interface FaissStoreOptions {
  /** Pre-configured faiss index */
  client?: any;
  /** Config to create an index internally */
  config?: FaissStoreConfig;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class FaissStoreAdapter implements VectorStorePort {
  private index: any;
  private faissModule: any;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: FaissStoreOptions;
  private documents: Map<number, { id: string; content: string; metadata: Record<string, unknown> }> = new Map();
  private idToInternal: Map<string, number> = new Map();
  private nextId = 0;

  constructor(options: FaissStoreOptions) {
    this.options = options;
    this.dimensions = options.dimensions ?? options.config?.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.index = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.index) {
      if (!this.options.config) {
        throw new Error("FaissStoreAdapter: either client or config.dimensions is required");
      }
      this.faissModule = await import("faiss-node");
      const faiss = this.faissModule.default ?? this.faissModule;
      const indexType = this.options.config.indexType ?? "flat";
      if (indexType === "ivf") {
        this.index = faiss.IndexFlatIP
          ? new faiss.IndexFlatIP(this.dimensions)
          : new faiss.IndexFlatL2(this.dimensions);
      } else {
        this.index = new faiss.IndexFlatL2(this.dimensions);
      }
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      for (const doc of batch) {
        if (this.idToInternal.has(doc.id)) {
          const internalId = this.idToInternal.get(doc.id)!;
          this.documents.set(internalId, { id: doc.id, content: doc.content, metadata: doc.metadata });
        }
        const internalId = this.nextId++;
        this.idToInternal.set(doc.id, internalId);
        this.documents.set(internalId, { id: doc.id, content: doc.content, metadata: doc.metadata });
        this.index.add(doc.embedding);
      }
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const searchResult = this.index.search(params.embedding, params.topK);
    const labels: number[] = searchResult.labels ?? [];
    const distances: number[] = searchResult.distances ?? [];

    let results: VectorSearchResult[] = [];
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label === -1) continue;
      const doc = this.documents.get(label);
      if (!doc) continue;
      const score = 1 / (1 + (distances[i] ?? 0));
      results.push({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        score,
      });
    }

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

    for (const id of ids) {
      const internalId = this.idToInternal.get(id);
      if (internalId !== undefined) {
        this.documents.delete(internalId);
        this.idToInternal.delete(id);
      }
    }
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();
    return {
      totalDocuments: this.documents.size,
      dimensions: this.dimensions,
      indexType: "faiss",
    };
  }

  async close(): Promise<void> {
    this.index = null;
    this.documents.clear();
    this.idToInternal.clear();
  }

  // ─── Filter Matching (in-memory) ────────────────────────────────────

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
    if (!this.index) {
      throw new Error("FaissStoreAdapter: call initialize() before using the adapter");
    }
  }
}
