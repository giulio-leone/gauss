// =============================================================================
// LanceDB Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: @lancedb/lancedb (peer dependency)
//
// Usage:
//   import { LanceStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new LanceStoreAdapter({
//     config: { uri: './lance-data', tableName: 'vectors' },
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured LanceDB table
//   const store = new LanceStoreAdapter({ client: lanceTable })
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

export interface LanceStoreConfig {
  /** LanceDB URI (local path or cloud URI) */
  uri: string;
  /** Table name */
  tableName: string;
}

export interface LanceStoreOptions {
  /** Pre-configured LanceDB table */
  client?: any;
  /** Config to create a table internally */
  config?: LanceStoreConfig;
  /** Table name (overrides config) */
  tableName?: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class LanceStoreAdapter implements VectorStorePort {
  private db: any;
  private table: any;
  private readonly tableName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: LanceStoreOptions;

  constructor(options: LanceStoreOptions) {
    this.options = options;
    this.tableName = options.tableName ?? options.config?.tableName ?? "vectors";
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.table = options.client;
  }

  async initialize(): Promise<void> {
    if (!this.table) {
      if (!this.options.config) {
        throw new Error("LanceStoreAdapter: either client or config.uri is required");
      }
      const lancedb = await import("@lancedb/lancedb");
      const connect = lancedb.connect ?? (lancedb as any).default?.connect;
      this.db = await connect(this.options.config.uri);

      const tableNames = await this.db.tableNames();
      if (tableNames.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
      } else {
        this.table = await this.db.createTable(this.tableName, [
          {
            id: "__init__",
            vector: new Array(this.dimensions).fill(0),
            content: "",
            metadata: "{}",
          },
        ]);
        await this.table.delete('id = "__init__"');
      }
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const rows = batch.map((doc) => ({
        id: doc.id,
        vector: doc.embedding,
        content: doc.content,
        metadata: JSON.stringify(doc.metadata),
      }));

      try {
        await this.table.mergeInsert("id").whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(rows);
      } catch {
        await this.table.add(rows);
      }
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    let search = this.table.search(params.embedding).limit(params.topK);

    if (params.filter) {
      const filterStr = this.translateFilter(params.filter);
      if (filterStr) search = search.where(filterStr);
    }

    const results = await search.toArray();

    let mapped: VectorSearchResult[] = (results ?? []).map((row: any) => ({
      id: row.id,
      content: row.content ?? "",
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {}),
      score: row._distance != null ? 1 - row._distance : (row.score ?? 0),
      ...(params.includeEmbeddings && row.vector ? { embedding: row.vector } : {}),
    }));

    if (params.minScore !== undefined) {
      mapped = mapped.filter((r) => r.score >= params.minScore!);
    }

    return mapped;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    const predicate = ids.map((id) => `id = '${id}'`).join(" OR ");
    await this.table.delete(predicate);
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const count = await this.table.countRows();
    return {
      totalDocuments: count ?? 0,
      dimensions: this.dimensions,
      indexType: "lancedb",
    };
  }

  async close(): Promise<void> {
    this.table = null;
    this.db = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────
  // LanceDB uses SQL-like WHERE clause syntax

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
          conditions.push(this.buildLanceCondition(field, op, val));
        }
      } else {
        conditions.push(
          typeof condition === "string"
            ? `json_extract_string(metadata, '$.${field}') = '${condition}'`
            : `json_extract(metadata, '$.${field}') = ${condition}`,
        );
      }
    }

    return conditions.length === 1 ? conditions[0] : `(${conditions.join(" AND ")})`;
  }

  private buildLanceCondition(field: string, op: string, val: unknown): string {
    const accessor = `json_extract(metadata, '$.${field}')`;
    const strAccessor = `json_extract_string(metadata, '$.${field}')`;
    switch (op) {
      case "$eq":
        return typeof val === "string" ? `${strAccessor} = '${val}'` : `${accessor} = ${val}`;
      case "$ne":
        return typeof val === "string" ? `${strAccessor} != '${val}'` : `${accessor} != ${val}`;
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
        return `${strAccessor} IN (${list})`;
      }
      case "$nin": {
        const list = (val as unknown[]).map((v) => (typeof v === "string" ? `'${v}'` : v)).join(",");
        return `${strAccessor} NOT IN (${list})`;
      }
      default:
        return `${strAccessor} = '${val}'`;
    }
  }

  private ensureInitialized(): void {
    if (!this.table) {
      throw new Error("LanceStoreAdapter: call initialize() before using the adapter");
    }
  }
}
