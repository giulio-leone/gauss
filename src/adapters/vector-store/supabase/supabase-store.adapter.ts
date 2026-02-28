// =============================================================================
// Supabase (pgvector) Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @supabase/supabase-js (peer dependency)
// Requires: a `match_documents` RPC function and `gauss_vectors` table in your
//           Supabase project with pgvector enabled.
//
// Usage:
//   import { SupabaseVectorStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new SupabaseVectorStoreAdapter({
//     config: { url: 'https://xxx.supabase.co', key: 'your-anon-key' },
//     dimensions: 1536,
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured SupabaseClient
//   import { createClient } from '@supabase/supabase-js'
//   const client = createClient('https://xxx.supabase.co', 'your-key')
//   const store = new SupabaseVectorStoreAdapter({ client })
//   await store.initialize()
//
// SQL setup (run once in Supabase SQL editor):
//
//   CREATE EXTENSION IF NOT EXISTS vector;
//
//   CREATE TABLE IF NOT EXISTS gauss_vectors (
//     id TEXT PRIMARY KEY,
//     embedding vector(1536),
//     content TEXT NOT NULL DEFAULT '',
//     metadata JSONB NOT NULL DEFAULT '{}'
//   );
//
//   CREATE INDEX IF NOT EXISTS idx_gauss_vectors_hnsw
//   ON gauss_vectors USING hnsw (embedding vector_cosine_ops);
//
//   CREATE OR REPLACE FUNCTION match_documents(
//     query_embedding vector(1536),
//     match_count INT DEFAULT 10,
//     filter JSONB DEFAULT '{}'
//   ) RETURNS TABLE (
//     id TEXT,
//     content TEXT,
//     metadata JSONB,
//     similarity FLOAT
//   ) LANGUAGE plpgsql AS $$
//   BEGIN
//     RETURN QUERY
//     SELECT
//       gv.id,
//       gv.content,
//       gv.metadata,
//       1 - (gv.embedding <=> query_embedding) AS similarity
//     FROM gauss_vectors gv
//     ORDER BY gv.embedding <=> query_embedding
//     LIMIT match_count;
//   END;
//   $$;
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

export interface SupabaseVectorStoreConfig {
  /** Supabase project URL */
  url: string;
  /** Supabase anon/service key */
  key: string;
}

export interface SupabaseVectorStoreOptions {
  /** Pre-configured SupabaseClient */
  client?: any;
  /** Config to create a client internally */
  config?: SupabaseVectorStoreConfig;
  /** Table name (default: 'gauss_vectors') */
  tableName?: string;
  /** RPC function name for similarity search (default: 'match_documents') */
  rpcFunction?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 500) */
  batchSize?: number;
}

export class SupabaseVectorStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly tableName: string;
  private readonly rpcFunction: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: SupabaseVectorStoreOptions;

  constructor(options: SupabaseVectorStoreOptions) {
    this.options = options;
    this.tableName = options.tableName ?? "gauss_vectors";
    this.rpcFunction = options.rpcFunction ?? "match_documents";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 500;
    if (options.client) this.client = options.client;
  }

  /** Initialize — create Supabase client if needed */
  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("SupabaseVectorStoreAdapter: either client or config.url + config.key is required");
      }
      const supabase = await import("@supabase/supabase-js");
      const createClient = supabase.createClient ?? (supabase as any).default?.createClient;
      this.client = createClient(this.options.config.url, this.options.config.key);
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    const rows = documents.map((doc) => ({
      id: doc.id,
      embedding: `[${doc.embedding.join(",")}]`,
      content: doc.content,
      metadata: doc.metadata,
    }));

    for (let i = 0; i < rows.length; i += this.batchSize) {
      const batch = rows.slice(i, i + this.batchSize);
      const { error } = await this.client
        .from(this.tableName)
        .upsert(batch, { onConflict: "id" });

      if (error) throw new Error(`SupabaseVectorStoreAdapter upsert failed: ${error.message}`);
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const rpcParams: Record<string, unknown> = {
      query_embedding: `[${params.embedding.join(",")}]`,
      match_count: params.topK,
    };

    if (params.filter) {
      rpcParams.filter = this.translateFilter(params.filter);
    }

    const { data, error } = await this.client.rpc(this.rpcFunction, rpcParams);

    if (error) throw new Error(`SupabaseVectorStoreAdapter query failed: ${error.message}`);

    let results: VectorSearchResult[] = (data ?? []).map((row: any) => ({
      id: row.id,
      content: row.content ?? "",
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {}),
      score: row.similarity ?? 0,
    }));

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    // Supabase RPC doesn't return embeddings by default; fetch separately if needed
    if (params.includeEmbeddings && results.length > 0) {
      const ids = results.map((r) => r.id);
      const { data: embData } = await this.client
        .from(this.tableName)
        .select("id, embedding")
        .in("id", ids);

      if (embData) {
        const embMap = new Map<string, number[]>();
        for (const row of embData) {
          if (row.embedding) {
            const parsed = typeof row.embedding === "string"
              ? JSON.parse(row.embedding)
              : row.embedding;
            embMap.set(row.id, parsed);
          }
        }
        results = results.map((r) => ({
          ...r,
          ...(embMap.has(r.id) ? { embedding: embMap.get(r.id)! } : {}),
        }));
      }
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .in("id", ids);

    if (error) throw new Error(`SupabaseVectorStoreAdapter delete failed: ${error.message}`);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const { count, error } = await this.client
      .from(this.tableName)
      .select("id", { count: "exact", head: true });

    if (error) throw new Error(`SupabaseVectorStoreAdapter indexStats failed: ${error.message}`);

    return {
      totalDocuments: count ?? 0,
      dimensions: this.dimensions,
      indexType: "supabase-pgvector",
    };
  }

  /** Close (no-op — Supabase client is stateless HTTP) */
  async close(): Promise<void> {
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // Translates VectorFilter to a JSONB filter object that the match_documents
  // RPC function can use. The RPC function should accept a JSONB filter param.

  private translateFilter(filter: VectorFilter): Record<string, unknown> {
    if ("$and" in filter) {
      return {
        $and: (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f)),
      };
    }
    if ("$or" in filter) {
      return {
        $or: (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f)),
      };
    }
    if ("$not" in filter) {
      return {
        $not: this.translateFilter((filter as { $not: VectorFilter }).$not),
      };
    }

    // Field-level conditions — pass through as the RPC handles JSONB filtering
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

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("SupabaseVectorStoreAdapter: call initialize() before using the adapter");
    }
  }
}
