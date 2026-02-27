// =============================================================================
// DatasetsPort — Dataset management contract
// =============================================================================

export interface DatasetEntry {
  id: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface DatasetInfo {
  name: string;
  version: number;
  entryCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DatasetQuery {
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  sort?: { field: string; order: "asc" | "desc" };
}

export interface DatasetsPort {
  /** Create a new dataset */
  create(name: string, metadata?: Record<string, unknown>): Promise<DatasetInfo>;

  /** Insert entries into a dataset */
  insert(name: string, entries: Omit<DatasetEntry, "id" | "createdAt">[]): Promise<string[]>;

  /** Query entries from a dataset */
  query(name: string, query?: DatasetQuery): Promise<DatasetEntry[]>;

  /** Delete a dataset */
  remove(name: string): Promise<void>;

  /** List all datasets */
  list(): Promise<DatasetInfo[]>;

  /** Get dataset info */
  info(name: string): Promise<DatasetInfo | undefined>;

  /** Create a new version (snapshot) */
  version(name: string): Promise<number>;
}
