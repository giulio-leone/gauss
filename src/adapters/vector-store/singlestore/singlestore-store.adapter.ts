// =============================================================================
// SingleStore Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: mysql2 (peer dependency)
//
// Usage:
//   const store = new SingleStoreStoreAdapter({
//     config: { host: 'localhost', user: 'root', password: '', database: 'vectors', tableName: 'embeddings' },
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

export interface SingleStoreStoreConfig {
  /** MySQL/SingleStore host */
  host: string;
  /** Port (default: 3306) */
  port?: number;
  /** Username */
  user: string;
  /** Password */
  password: string;
  /** Database name */
  database: string;
  /** Table name */
  tableName: string;
}

export interface SingleStoreStoreOptions {
  /** Pre-configured mysql2 pool/connection */
  client?: any;
  /** Config to create a connection internally */
  config?: SingleStoreStoreConfig;
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
  if (typeof val === "boolean") return val ? "1" : "0";
  return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}

/** Escape a field/table name for SQL */
function escField(field: string): string {
  return `\`${field.replace(/`/g, "``")}\``;
}

export class SingleStoreStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly tableName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: SingleStoreStoreOptions;

  constructor(options: SingleStoreStoreOptions) {
    this.options = options;
    this.tableName = options.tableName ?? options.config?.tableName ?? "embeddings";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("SingleStoreStoreAdapter: either client or config is required");
      }
      const mysql = await import("mysql2");
      const createPool = (mysql as any).createPool ?? (mysql as any).default?.createPool;
      this.client = createPool({
        host: this.options.config.host,
        port: this.options.config.port ?? 3306,
        user: this.options.config.user,
        password: this.options.config.password,
        database: this.options.config.database,
      }).promise();
    }

    const tbl = escField(this.tableName);
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS ${tbl} (
        id VARCHAR(512) PRIMARY KEY,
        embedding BLOB NOT NULL,
        content LONGTEXT,
        metadata JSON
      )
    `);
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    const tbl = escField(this.tableName);
    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const values = batch
        .map(
          (doc) =>
            `(${esc(doc.id)}, JSON_ARRAY_PACK(${esc(JSON.stringify(doc.embedding))}), ${esc(doc.content)}, ${esc(JSON.stringify(doc.metadata))})`,
        )
        .join(",");
      await this.client.execute(
        `REPLACE INTO ${tbl} (id, embedding, content, metadata) VALUES ${values}`,
      );
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const tbl = escField(this.tableName);
    let where = "";
    if (params.filter) {
      where = ` WHERE ${this.translateFilter(params.filter)}`;
    }

    const vecParam = esc(JSON.stringify(params.embedding));
    const sql = `
      SELECT id, content, metadata,
             DOT_PRODUCT(embedding, JSON_ARRAY_PACK(${vecParam})) AS score
      FROM ${tbl}${where}
      ORDER BY score DESC
      LIMIT ${Number(params.topK)}
    `;

    const [rows] = await this.client.execute(sql);

    let results: VectorSearchResult[] = (rows as any[]).map((row: any) => {
      let metadata: Record<string, unknown> = {};
      try { metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata ?? {}; } catch { /* empty */ }
      return {
        id: row.id,
        content: row.content ?? "",
        metadata,
        score: row.score ?? 0,
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

    const tbl = escField(this.tableName);
    const list = ids.map((id) => esc(id)).join(",");
    await this.client.execute(`DELETE FROM ${tbl} WHERE id IN (${list})`);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const tbl = escField(this.tableName);
    const [rows] = await this.client.execute(`SELECT COUNT(*) AS cnt FROM ${tbl}`);
    return {
      totalDocuments: (rows as any[])[0]?.cnt ?? 0,
      dimensions: this.dimensions,
      indexType: "singlestore",
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
      const jsonPath = `JSON_EXTRACT_STRING(metadata, ${esc(field)})`;
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
      case "$gt": return `${jsonPath} > ${esc(val)}`;
      case "$gte": return `${jsonPath} >= ${esc(val)}`;
      case "$lt": return `${jsonPath} < ${esc(val)}`;
      case "$lte": return `${jsonPath} <= ${esc(val)}`;
      case "$in": return `${jsonPath} IN (${(val as unknown[]).map((v) => esc(v)).join(",")})`;
      case "$nin": return `${jsonPath} NOT IN (${(val as unknown[]).map((v) => esc(v)).join(",")})`;
      default: return `${jsonPath} = ${esc(val)}`;
    }
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("SingleStoreStoreAdapter: call initialize() before using the adapter");
    }
  }
}
