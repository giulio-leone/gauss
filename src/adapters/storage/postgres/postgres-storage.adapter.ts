// =============================================================================
// PostgreSQL Storage Adapter — Implements StorageDomainPort
// =============================================================================
//
// Requires: pg (peer dependency)
// Table: gauss_storage (id, domain, data JSONB, created_at, updated_at)
//
// Usage:
//   import { PostgresStorageAdapter } from 'gauss'
//   const storage = new PostgresStorageAdapter({ connectionString: '...' })
//   await storage.initialize() // creates table if not exists
//
// =============================================================================

import type {
  StorageDomainPort,
  StorageDomain,
  StorageRecord,
  StorageQuery,
  PaginatedResult,
} from "../../../ports/storage-domain.port.js";

export interface PostgresStorageOptions {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Table name (default: 'gauss_storage') */
  tableName?: string;
  /** Schema name (default: 'public') */
  schema?: string;
  /** Pool size (default: 10) */
  poolSize?: number;
}

export class PostgresStorageAdapter implements StorageDomainPort {
  private pool: unknown;
  private readonly table: string;
  private readonly schema: string;
  private readonly options: PostgresStorageOptions;

  constructor(options: PostgresStorageOptions) {
    this.options = options;
    this.schema = options.schema ?? "public";
    this.table = `${this.schema}.${options.tableName ?? "gauss_storage"}`;
  }

  /** Initialize the adapter — creates table if not exists */
  async initialize(): Promise<void> {
    const pg = await import("pg");
    const Pool = pg.default?.Pool ?? pg.Pool;
    this.pool = new Pool({
      connectionString: this.options.connectionString,
      max: this.options.poolSize ?? 10,
    });

    await (this.pool as any).query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id TEXT NOT NULL,
        domain TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (domain, id)
      )
    `);

    await (this.pool as any).query(`
      CREATE INDEX IF NOT EXISTS idx_${this.options.tableName ?? "gauss_storage"}_domain
      ON ${this.table} (domain)
    `);
  }

  async put(
    domain: StorageDomain,
    id: string,
    data: Record<string, unknown>,
  ): Promise<StorageRecord> {
    const now = Date.now();
    const result = await (this.pool as any).query(
      `INSERT INTO ${this.table} (id, domain, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (domain, id) DO UPDATE SET
         data = $3, updated_at = $5
       RETURNING *`,
      [id, domain, JSON.stringify(data), now, now],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      domain: row.domain as StorageDomain,
      data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  async get(domain: StorageDomain, id: string): Promise<StorageRecord | null> {
    const result = await (this.pool as any).query(
      `SELECT * FROM ${this.table} WHERE domain = $1 AND id = $2`,
      [domain, id],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      domain: row.domain as StorageDomain,
      data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  async delete(domain: StorageDomain, id: string): Promise<boolean> {
    const result = await (this.pool as any).query(
      `DELETE FROM ${this.table} WHERE domain = $1 AND id = $2`,
      [domain, id],
    );
    return result.rowCount > 0;
  }

  async query(params: StorageQuery): Promise<PaginatedResult<StorageRecord>> {
    const conditions = ["domain = $1"];
    const values: unknown[] = [params.domain];
    let paramIndex = 2;

    if (params.filter) {
      for (const [key, val] of Object.entries(params.filter)) {
        conditions.push(`data->>$${paramIndex} = $${paramIndex + 1}`);
        values.push(key, String(val));
        paramIndex += 2;
      }
    }

    const where = conditions.join(" AND ");

    // Count
    const countResult = await (this.pool as any).query(
      `SELECT COUNT(*) FROM ${this.table} WHERE ${where}`,
      values,
    );
    const total = Number(countResult.rows[0].count);

    // Fetch
    const orderBy = params.orderBy ?? "created_at";
    const orderDir = params.orderDir ?? "asc";
    const orderColumn = orderBy === "createdAt" ? "created_at"
      : orderBy === "updatedAt" ? "updated_at"
      : `data->>'${orderBy.replace(/'/g, "''")}'`;

    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const result = await (this.pool as any).query(
      `SELECT * FROM ${this.table} WHERE ${where}
       ORDER BY ${orderColumn} ${orderDir}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset],
    );

    return {
      items: result.rows.map((row: any) => ({
        id: row.id,
        domain: row.domain as StorageDomain,
        data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  async count(domain: StorageDomain): Promise<number> {
    const result = await (this.pool as any).query(
      `SELECT COUNT(*) FROM ${this.table} WHERE domain = $1`,
      [domain],
    );
    return Number(result.rows[0].count);
  }

  async clear(domain: StorageDomain): Promise<number> {
    const result = await (this.pool as any).query(
      `DELETE FROM ${this.table} WHERE domain = $1`,
      [domain],
    );
    return result.rowCount;
  }

  /** Close the pool */
  async close(): Promise<void> {
    if (this.pool) await (this.pool as any).end();
  }
}
