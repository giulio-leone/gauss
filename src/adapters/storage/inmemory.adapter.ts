// =============================================================================
// InMemoryStorageAdapter — In-memory multi-domain storage
// =============================================================================

import type {
  StorageDomainPort,
  StorageDomain,
  StorageRecord,
  StorageQuery,
  PaginatedResult,
} from "../../ports/storage-domain.port.js";

export class InMemoryStorageAdapter implements StorageDomainPort {
  private readonly domains = new Map<StorageDomain, Map<string, StorageRecord>>();

  private getDomain(domain: StorageDomain): Map<string, StorageRecord> {
    let store = this.domains.get(domain);
    if (!store) {
      store = new Map();
      this.domains.set(domain, store);
    }
    return store;
  }

  async put(
    domain: StorageDomain,
    id: string,
    data: Record<string, unknown>,
  ): Promise<StorageRecord> {
    const store = this.getDomain(domain);
    const now = Date.now();
    const existing = store.get(id);
    const record: StorageRecord = {
      id,
      domain,
      data: { ...data },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    store.set(id, record);
    return { ...record };
  }

  async get(domain: StorageDomain, id: string): Promise<StorageRecord | null> {
    const store = this.getDomain(domain);
    const record = store.get(id);
    return record ? { ...record, data: { ...record.data } } : null;
  }

  async delete(domain: StorageDomain, id: string): Promise<boolean> {
    return this.getDomain(domain).delete(id);
  }

  async query(params: StorageQuery): Promise<PaginatedResult<StorageRecord>> {
    const store = this.getDomain(params.domain);
    let items = Array.from(store.values());

    // Filter
    if (params.filter) {
      items = items.filter((r) => {
        for (const [key, val] of Object.entries(params.filter!)) {
          if (r.data[key] !== val) return false;
        }
        return true;
      });
    }

    // Sort
    if (params.orderBy) {
      const dir = params.orderDir === "desc" ? -1 : 1;
      const field = params.orderBy;
      items.sort((a, b) => {
        const va = (field === "createdAt" || field === "updatedAt")
          ? a[field]
          : a.data[field];
        const vb = (field === "createdAt" || field === "updatedAt")
          ? b[field]
          : b.data[field];
        if (va === vb) return 0;
        if (va === undefined || va === null) return 1;
        if (vb === undefined || vb === null) return -1;
        return va < vb ? -dir : dir;
      });
    }

    const total = items.length;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    const paged = items.slice(offset, offset + limit);

    return {
      items: paged.map((r) => ({ ...r, data: { ...r.data } })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  async count(domain: StorageDomain): Promise<number> {
    return this.getDomain(domain).size;
  }

  async clear(domain: StorageDomain): Promise<number> {
    const store = this.getDomain(domain);
    const count = store.size;
    store.clear();
    return count;
  }
}
