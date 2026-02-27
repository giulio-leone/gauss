// =============================================================================
// StorageDomainPort — Multi-domain storage with composite pattern
// =============================================================================

export type StorageDomain =
  | "memory"
  | "workflows"
  | "scores"
  | "agents"
  | "skills"
  | "blobs"
  | "learning"
  | "metrics";

export interface StorageRecord {
  id: string;
  domain: StorageDomain;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface StorageQuery {
  domain: StorageDomain;
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// =============================================================================
// Port interface
// =============================================================================

export interface StorageDomainPort {
  /** Create or update a record */
  put(domain: StorageDomain, id: string, data: Record<string, unknown>): Promise<StorageRecord>;

  /** Get a record by ID */
  get(domain: StorageDomain, id: string): Promise<StorageRecord | null>;

  /** Delete a record */
  delete(domain: StorageDomain, id: string): Promise<boolean>;

  /** Query records with pagination */
  query(params: StorageQuery): Promise<PaginatedResult<StorageRecord>>;

  /** Count records in a domain */
  count(domain: StorageDomain): Promise<number>;

  /** Clear all records in a domain */
  clear(domain: StorageDomain): Promise<number>;
}

// =============================================================================
// Composite Storage — Default backend + per-domain overrides
// =============================================================================

export class CompositeStorageAdapter implements StorageDomainPort {
  private readonly defaultBackend: StorageDomainPort;
  private readonly overrides: Partial<Record<StorageDomain, StorageDomainPort>>;

  constructor(
    defaultBackend: StorageDomainPort,
    overrides?: Partial<Record<StorageDomain, StorageDomainPort>>,
  ) {
    this.defaultBackend = defaultBackend;
    this.overrides = overrides ?? {};
  }

  private resolve(domain: StorageDomain): StorageDomainPort {
    return this.overrides[domain] ?? this.defaultBackend;
  }

  async put(domain: StorageDomain, id: string, data: Record<string, unknown>): Promise<StorageRecord> {
    return this.resolve(domain).put(domain, id, data);
  }

  async get(domain: StorageDomain, id: string): Promise<StorageRecord | null> {
    return this.resolve(domain).get(domain, id);
  }

  async delete(domain: StorageDomain, id: string): Promise<boolean> {
    return this.resolve(domain).delete(domain, id);
  }

  async query(params: StorageQuery): Promise<PaginatedResult<StorageRecord>> {
    return this.resolve(params.domain).query(params);
  }

  async count(domain: StorageDomain): Promise<number> {
    return this.resolve(domain).count(domain);
  }

  async clear(domain: StorageDomain): Promise<number> {
    return this.resolve(domain).clear(domain);
  }
}
