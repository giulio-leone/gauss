// =============================================================================
// DuckDB Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: duckdb (peer dependency)
//
// Usage:
//   import { DuckDBStoreAdapter } from 'gauss'
//
//   // Option A — pass config (in-memory or file-backed)
//   const store = new DuckDBStoreAdapter({
//     config: { path: ':memory:', tableName: 'embeddings' },
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured duckdb connection
//   const store = new DuckDBStoreAdapter({
//     client: existingConnection,
//     tableName: 'embeddings',
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

export interface DuckDBStoreConfig {
  /** Database path (default: ':memory:') */
  path?: string;
  /** Table name for vectors */
  tableName: string;
}

export interface DuckDBStoreOptions {
  /** Pre-configured DuckDB connection */
  client?: any;
  /** Config to create a connection internally */
  config?: DuckDBStoreConfig;
  /** Table name (overrides config) */
  tableName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class DuckDBStoreAdapter implements VectorStorePort {
  private db: any;
  private conn: any;
  private readonly tableName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: DuckDBStoreOptions;

  constructor(options: DuckDBStoreOptions) {
    this.options = options;
    this.tableName = options.tableName ?? options.config?.tableName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.conn = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.conn) {
      if (!this.options.config && !this.options.client) {
        throw new Error("DuckDBStoreAdapter: either client or config is required");
      }
      const duckdb = await import("duckdb");
      const DuckDB = duckdb.Database ?? (duckdb as any).default?.Database ?? (duckdb as any).default;
      const dbPath = this.options.config?.path ?? ":memory:";
      this.db = await this.createDatabase(DuckDB, dbPath);
      this.conn = await this.createConnection(this.db);
    }

    await this.run("INSTALL vss; LOAD vss;");
    await this.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id VARCHAR PRIMARY KEY,
        embedding FLOAT[${this.dimensions}],
        content VARCHAR,
        metadata JSON
      )
    `);
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      for (const doc of batch) {
        const embeddingStr = `[${doc.embedding.join(",")}]`;
        const metadataStr = JSON.stringify(doc.metadata).replace(/'/g, "''");
        const contentStr = doc.content.replace(/'/g, "''");
        await this.run(`
          INSERT OR REPLACE INTO ${this.tableName} (id, embedding, content, metadata)
          VALUES ('${doc.id}', ${embeddingStr}::FLOAT[${this.dimensions}], '${contentStr}', '${metadataStr}')
        `);
      }
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const embeddingStr = `[${params.embedding.join(",")}]`;
    let whereClause = "";
    if (params.filter) {
      const filterSql = this.translateFilter(params.filter);
      if (filterSql) whereClause = `WHERE ${filterSql}`;
    }

    const sql = `
      SELECT id, content, metadata, embedding,
        array_cosine_similarity(embedding, ${embeddingStr}::FLOAT[${this.dimensions}]) AS score
      FROM ${this.tableName}
      ${whereClause}
      ORDER BY score DESC
      LIMIT ${params.topK}
    `;

    const rows = await this.all(sql);

    let results: VectorSearchResult[] = (rows ?? []).map((row: any) => ({
      id: row.id,
      content: row.content ?? "",
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {}),
      score: row.score ?? 0,
      ...(params.includeEmbeddings && row.embedding ? { embedding: row.embedding } : {}),
    }));

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    const idList = ids.map((id) => `'${id}'`).join(",");
    await this.run(`DELETE FROM ${this.tableName} WHERE id IN (${idList})`);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const rows = await this.all(`SELECT COUNT(*) AS cnt FROM ${this.tableName}`);
    return {
      totalDocuments: rows?.[0]?.cnt ?? 0,
      dimensions: this.dimensions,
      indexType: "duckdb-vss",
    };
  }

  async close(): Promise<void> {
    if (this.conn?.close) this.conn.close();
    if (this.db?.close) this.db.close();
    this.conn = null;
    this.db = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): string {
    if ("$and" in filter) {
      const clauses = (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f));
      return `(${clauses.join(" AND ")})`;
    }
    if ("$or" in filter) {
      const clauses = (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f));
      return `(${clauses.join(" OR ")})`;
    }
    if ("$not" in filter) {
      return `NOT (${this.translateFilter((filter as { $not: VectorFilter }).$not)})`;
    }

    const conditions: string[] = [];
    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildDuckDBCondition(field, op, val));
        }
      } else {
        conditions.push(`json_extract_string(metadata, '$.${field}') = '${condition}'`);
      }
    }

    return conditions.length === 1 ? conditions[0] : `(${conditions.join(" AND ")})`;
  }

  private buildDuckDBCondition(field: string, op: string, val: unknown): string {
    const accessor = `json_extract(metadata, '$.${field}')`;
    switch (op) {
      case "$eq":
        return typeof val === "string"
          ? `json_extract_string(metadata, '$.${field}') = '${val}'`
          : `CAST(${accessor} AS DOUBLE) = ${val}`;
      case "$ne":
        return typeof val === "string"
          ? `json_extract_string(metadata, '$.${field}') != '${val}'`
          : `CAST(${accessor} AS DOUBLE) != ${val}`;
      case "$gt":
        return `CAST(${accessor} AS DOUBLE) > ${val}`;
      case "$gte":
        return `CAST(${accessor} AS DOUBLE) >= ${val}`;
      case "$lt":
        return `CAST(${accessor} AS DOUBLE) < ${val}`;
      case "$lte":
        return `CAST(${accessor} AS DOUBLE) <= ${val}`;
      case "$in": {
        const list = (val as unknown[]).map((v) => (typeof v === "string" ? `'${v}'` : v)).join(",");
        return `json_extract_string(metadata, '$.${field}') IN (${list})`;
      }
      case "$nin": {
        const list = (val as unknown[]).map((v) => (typeof v === "string" ? `'${v}'` : v)).join(",");
        return `json_extract_string(metadata, '$.${field}') NOT IN (${list})`;
      }
      default:
        return `json_extract_string(metadata, '$.${field}') = '${val}'`;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private createDatabase(DuckDB: any, path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let instance: any;
      instance = new DuckDB(path, (err: any) => {
        if (err) reject(err);
        else resolve(instance);
      });
    });
  }

  private createConnection(db: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let conn: any;
      conn = db.connect((err: any) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });
  }

  private run(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.run(sql, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private all(sql: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, (err: any, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  private ensureInitialized(): void {
    if (!this.conn) {
      throw new Error("DuckDBStoreAdapter: call initialize() before using the adapter");
    }
  }
}
