// =============================================================================
// InMemoryDatasetsAdapter — In-memory dataset management
// =============================================================================

import type { DatasetsPort, DatasetEntry, DatasetInfo, DatasetQuery } from "../../ports/datasets.port.js";
import { randomUUID } from "node:crypto";

interface Dataset {
  info: DatasetInfo;
  entries: Map<string, DatasetEntry>;
  metadata?: Record<string, unknown>;
}

let idCounter = 0;

export class InMemoryDatasetsAdapter implements DatasetsPort {
  private datasets = new Map<string, Dataset>();

  async create(name: string, metadata?: Record<string, unknown>): Promise<DatasetInfo> {
    if (this.datasets.has(name)) throw new Error(`Dataset "${name}" already exists`);
    const now = Date.now();
    const info: DatasetInfo = { name, version: 1, entryCount: 0, createdAt: now, updatedAt: now };
    this.datasets.set(name, { info, entries: new Map(), metadata });
    return { ...info };
  }

  async insert(name: string, entries: Omit<DatasetEntry, "id" | "createdAt">[]): Promise<string[]> {
    const ds = this.datasets.get(name);
    if (!ds) throw new Error(`Dataset "${name}" not found`);
    const ids: string[] = [];
    for (const entry of entries) {
      const id = randomUUID();
      const full: DatasetEntry = { id, data: entry.data, metadata: entry.metadata, createdAt: Date.now() };
      ds.entries.set(id, full);
      ids.push(id);
    }
    ds.info.entryCount = ds.entries.size;
    ds.info.updatedAt = Date.now();
    return ids;
  }

  async query(name: string, query?: DatasetQuery): Promise<DatasetEntry[]> {
    const ds = this.datasets.get(name);
    if (!ds) throw new Error(`Dataset "${name}" not found`);
    let results = [...ds.entries.values()];

    // Filter
    if (query?.filter) {
      results = results.filter(e =>
        Object.entries(query.filter!).every(([k, v]) => e.data[k] === v),
      );
    }

    // Sort
    if (query?.sort) {
      const { field, order } = query.sort;
      results.sort((a, b) => {
        const av = a.data[field], bv = b.data[field];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return order === "desc" ? -cmp : cmp;
      });
    }

    // Pagination
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async remove(name: string): Promise<void> {
    if (!this.datasets.delete(name)) throw new Error(`Dataset "${name}" not found`);
  }

  async list(): Promise<DatasetInfo[]> {
    return [...this.datasets.values()].map(ds => ({ ...ds.info }));
  }

  async info(name: string): Promise<DatasetInfo | undefined> {
    const ds = this.datasets.get(name);
    return ds ? { ...ds.info } : undefined;
  }

  async version(name: string): Promise<number> {
    const ds = this.datasets.get(name);
    if (!ds) throw new Error(`Dataset "${name}" not found`);
    ds.info.version++;
    ds.info.updatedAt = Date.now();
    return ds.info.version;
  }
}
