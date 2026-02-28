// =============================================================================
// CockroachDB Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: pg (peer dependency)
//
// Uses pgvector extension on CockroachDB.
//
// Usage:
//   const store = new CockroachDBStoreAdapter({
//     config: { connectionString: 'postgresql://...', tableName: 'embeddings' },
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

export interface CockroachDBStoreConfig {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Table name */
  tableName: string;
}

export interface CockroachDBStoreOptions {
  /** Pre-configured pg Pool/Client */
  client?: any;
  /** Config to create a client internally */
  config?: CockroachDBStoreConfig;
  /** Table name (overrides config) */
  tableName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

/** Escape a string value for SQL (prevent injection) */
function esc(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  return `'${String(val).replace(/'/g, "''")}'`;
}

/** Escape a field/table name for SQL */
function escField(field: string): string {
  return `"${field.replace(/"/g, '""')}"`;
}

export class CockroachDBStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly tableName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: CockroachDBStoreOptions;

  constructor(options: CockroachDBStoreOptions) {
    this.options = options;
    this.tableName = options.tableName ?? options.config?.tableName ?? "embeddings";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("CockroachDBStoreAdapter: either client or config.connectionString is required");
      }
      const pg = await import("pg");
      const Pool = pg.Pool ?? (pg as any).default?.Pool;
      this.client = new Pool({ connectionString: this.options.config.connectionString });
    }

    const tbl = escField(this.tableName);
    await this.client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${tbl} (
        id TEXT PRIMARY KEY,
        embedding vector(${this.dimensions}),
        content TEXT,
        metadata JSONB
      )
    `);
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    const tbl = escField(this.tableName);
    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const values: string[] = [];
      const params: unknown[] = [];
      batch.forEach((doc, idx) => {
        const offset = idx * 4;
        values.push(`($${offset + 1}, $${offset + 2}::vector, $${offset + 3}, $${offset + 4}::jsonb)`);
        params.push(doc.id, `[${doc.embedding.join(",")}]`, doc.content, JSON.stringify(doc.metadata));
      });
      await this.client.query(
        `INSERT INTO ${tbl} (id, embedding, content, metadata) VALUES ${values.join(",")}
         ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, content = EXCLUDED.content, metadata = EXCLUDED.metadata`,
        params,
      );
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const tbl = escField(this.tableName);
    let where = "";
    const sqlParams: unknown[] = [`[${params.embedding.join(",")}]`];

    if (params.filter) {
      where = ` WHERE ${this.translateFilter(params.filter)}`;
    }

    const sql = `
      SELECT id, content, metadata,
             1 - (embedding <=> $1::vector) AS score
      FROM ${tbl}${where}
      ORDER BY embedding <=> $1::vector
      LIMIT ${Number(params.topK)}
    `;

    const result = await this.client.query(sql, sqlParams);

    let results: VectorSearchResult[] = (result.rows ?? []).map((row: any) => ({
      id: row.id,
      content: row.content ?? "",
      metadata: row.metadata ?? {},
      score: parseFloat(row.score) || 0,
    }));

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    const tbl = escField(this.tableName);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    await this.client.query(`DELETE FROM ${tbl} WHERE id IN (${placeholders})`, ids);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const tbl = escField(this.tableName);
    const result = await this.client.query(`SELECT COUNT(*) AS cnt FROM ${tbl}`);
    return {
      totalDocuments: parseInt(result.rows[0]?.cnt ?? "0", 10),
      dimensions: this.dimensions,
      indexType: "cockroachdb",
    };
  }

  async close(): Promise<void> {
    if (this.client?.end) await this.client.end();
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      const parts = (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f));
      return `(${parts.join(" AND ")})`;
    }
    if ("$or" in filter) {
      const parts = (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f));
      return `(${parts.join(" OR ")})`;
    }
    if ("$not" in filter) {
      return `NOT (${this.translateFilter((filter as { $not: VectorFilter }).$not)})`;
    }

    const conditions: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      const jsonPath = `metadata->>` + esc(field);
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildCondition(jsonPath, op, val));
        }
      } else {
        conditions.push(`${jsonPath} = ${esc(condition)}`);
      }
    }
    return conditions.join(" AND ");
  }

  private buildCondition(jsonPath: string, op: string, val: unknown): string {
    switch (op) {
      case "$eq": return `${jsonPath} = ${esc(val)}`;
      case "$ne": return `${jsonPath} != ${esc(val)}`;
      case "$gt": return `(${jsonPath})::numeric > ${esc(val)}`;
      case "$gte": return `(${jsonPath})::numeric >= ${esc(val)}`;
      case "$lt": return `(${jsonPath})::numeric < ${esc(val)}`;
      case "$lte": return `(${jsonPath})::numeric <= ${esc(val)}`;
      case "$in": return `${jsonPath} IN (${(val as unknown[]).map((v) => esc(v)).join(",")})`;
      case "$nin": return `${jsonPath} NOT IN (${(val as unknown[]).map((v) => esc(v)).join(",")})`;
      default: return `${jsonPath} = ${esc(val)}`;
    }
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("CockroachDBStoreAdapter: call initialize() before using the adapter");
    }
  }
}
