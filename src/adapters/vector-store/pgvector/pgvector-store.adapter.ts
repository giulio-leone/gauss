// =============================================================================
// pgvector Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: pg (peer dependency), pgvector extension enabled in PostgreSQL
//
// Usage:
//   import { PgVectorStoreAdapter } from 'gauss'
//   const store = new PgVectorStoreAdapter({
//     connectionString: '...',
//     dimensions: 1536,
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

export interface PgVectorStoreOptions {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Table name (default: 'gauss_vectors') */
  tableName?: string;
  /** Schema name (default: 'public') */
  schema?: string;
  /** Embedding dimensions (default: 1536 for OpenAI ada-002) */
  dimensions?: number;
  /** Pool size (default: 10) */
  poolSize?: number;
  /** Use HNSW index for approximate search (default: true) */
  useHnsw?: boolean;
}

export class PgVectorStoreAdapter implements VectorStorePort {
  private pool: any;
  private readonly table: string;
  private readonly schema: string;
  private readonly dimensions: number;
  private readonly options: PgVectorStoreOptions;

  constructor(options: PgVectorStoreOptions) {
    this.options = options;
    this.schema = options.schema ?? "public";
    this.dimensions = options.dimensions ?? 1536;
    this.table = `${this.schema}.${options.tableName ?? "gauss_vectors"}`;
  }

  /** Initialize the adapter — creates table and index */
  async initialize(): Promise<void> {
    const pg = await import("pg");
    const Pool = pg.default?.Pool ?? pg.Pool;
    this.pool = new Pool({
      connectionString: this.options.connectionString,
      max: this.options.poolSize ?? 10,
    });

    // Enable pgvector extension
    await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector");

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id TEXT PRIMARY KEY,
        embedding vector(${this.dimensions}),
        content TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'
      )
    `);

    if (this.options.useHnsw !== false) {
      const indexName = `idx_${(this.options.tableName ?? "gauss_vectors")}_hnsw`;
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS ${indexName}
        ON ${this.table}
        USING hnsw (embedding vector_cosine_ops)
      `);
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const doc of documents) {
      placeholders.push(`($${idx}, $${idx + 1}::vector, $${idx + 2}, $${idx + 3}::jsonb)`);
      values.push(doc.id, `[${doc.embedding.join(",")}]`, doc.content, JSON.stringify(doc.metadata));
      idx += 4;
    }

    await this.pool.query(
      `INSERT INTO ${this.table} (id, embedding, content, metadata)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (id) DO UPDATE SET
         embedding = EXCLUDED.embedding,
         content = EXCLUDED.content,
         metadata = EXCLUDED.metadata`,
      values,
    );
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    const conditions: string[] = [];
    const values: unknown[] = [`[${params.embedding.join(",")}]`];
    let paramIdx = 2;

    if (params.filter) {
      const filterSql = this.buildFilterSql(params.filter, values, paramIdx);
      if (filterSql.sql) {
        conditions.push(filterSql.sql);
        paramIdx = filterSql.nextIdx;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const selectEmbedding = params.includeEmbeddings ? ", embedding" : "";

    const result = await this.pool.query(
      `SELECT id, content, metadata, 1 - (embedding <=> $1::vector) AS score ${selectEmbedding}
       FROM ${this.table}
       ${where}
       ORDER BY embedding <=> $1::vector
       LIMIT $${paramIdx}`,
      [...values, params.topK],
    );

    let results: VectorSearchResult[] = result.rows.map((row: any) => ({
      id: row.id,
      content: row.content,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
      score: Number(row.score),
      ...(params.includeEmbeddings && row.embedding ? { embedding: row.embedding } : {}),
    }));

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await this.pool.query(`DELETE FROM ${this.table} WHERE id IN (${placeholders})`, ids);
  }

  async indexStats(): Promise<VectorIndexStats> {
    const result = await this.pool.query(`SELECT COUNT(*) FROM ${this.table}`);
    return {
      totalDocuments: Number(result.rows[0].count),
      dimensions: this.dimensions,
      indexType: this.options.useHnsw !== false ? "hnsw" : "flat",
    };
  }

  /** Close the pool */
  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }

  // ─── Filter SQL Builder ─────────────────────────────────────────────────

  private buildFilterSql(
    filter: VectorFilter,
    values: unknown[],
    startIdx: number,
  ): { sql: string; nextIdx: number } {
    if ("$and" in filter) {
      const parts: string[] = [];
      let idx = startIdx;
      for (const sub of (filter as { $and: VectorFilter[] }).$and) {
        const r = this.buildFilterSql(sub, values, idx);
        if (r.sql) parts.push(r.sql);
        idx = r.nextIdx;
      }
      return { sql: parts.length > 0 ? `(${parts.join(" AND ")})` : "", nextIdx: idx };
    }

    if ("$or" in filter) {
      const parts: string[] = [];
      let idx = startIdx;
      for (const sub of (filter as { $or: VectorFilter[] }).$or) {
        const r = this.buildFilterSql(sub, values, idx);
        if (r.sql) parts.push(r.sql);
        idx = r.nextIdx;
      }
      return { sql: parts.length > 0 ? `(${parts.join(" OR ")})` : "", nextIdx: idx };
    }

    if ("$not" in filter) {
      const r = this.buildFilterSql((filter as { $not: VectorFilter }).$not, values, startIdx);
      return { sql: r.sql ? `NOT (${r.sql})` : "", nextIdx: r.nextIdx };
    }

    // Field-level operators
    const parts: string[] = [];
    let idx = startIdx;

    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          const jsonPath = `metadata->>'${field.replace(/'/g, "''")}'`;
          switch (op) {
            case "$eq":
              parts.push(`${jsonPath} = $${idx}`);
              values.push(String(val));
              idx++;
              break;
            case "$ne":
              parts.push(`${jsonPath} != $${idx}`);
              values.push(String(val));
              idx++;
              break;
            case "$gt":
              parts.push(`(${jsonPath})::numeric > $${idx}`);
              values.push(val);
              idx++;
              break;
            case "$gte":
              parts.push(`(${jsonPath})::numeric >= $${idx}`);
              values.push(val);
              idx++;
              break;
            case "$lt":
              parts.push(`(${jsonPath})::numeric < $${idx}`);
              values.push(val);
              idx++;
              break;
            case "$lte":
              parts.push(`(${jsonPath})::numeric <= $${idx}`);
              values.push(val);
              idx++;
              break;
            case "$in": {
              const arr = val as unknown[];
              const ph = arr.map((_, i) => `$${idx + i}`).join(", ");
              parts.push(`${jsonPath} IN (${ph})`);
              for (const v of arr) { values.push(String(v)); idx++; }
              break;
            }
            case "$nin": {
              const arr = val as unknown[];
              const ph = arr.map((_, i) => `$${idx + i}`).join(", ");
              parts.push(`${jsonPath} NOT IN (${ph})`);
              for (const v of arr) { values.push(String(v)); idx++; }
              break;
            }
          }
        }
      } else {
        // Direct equality
        const jsonPath = `metadata->>'${field.replace(/'/g, "''")}'`;
        parts.push(`${jsonPath} = $${idx}`);
        values.push(String(condition));
        idx++;
      }
    }

    return { sql: parts.join(" AND "), nextIdx: idx };
  }
}
