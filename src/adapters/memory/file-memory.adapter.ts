// =============================================================================
// FileMemoryAdapter — File-based persistent implementation of AgentMemoryPort
// =============================================================================

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type {
  AgentMemoryPort,
  MemoryEntry,
  RecallOptions,
  MemoryStats,
} from "../../ports/agent-memory.port.js";
import { calculateMemoryStats } from "./memory-utils.js";

/** Max characters kept when summarizing memory entries */
const SUMMARY_MAX_LENGTH = 500;

export interface FileMemoryAdapterOptions {
  directory?: string; // default: .gauss/memory/
}

export class FileMemoryAdapter implements AgentMemoryPort {
  private readonly directory: string;
  private readonly fileLocks = new Map<string, Promise<void>>();
  private dirReady = false;

  constructor(options: FileMemoryAdapterOptions = {}) {
    this.directory = options.directory ?? ".gauss/memory";
  }

  private getFilePath(sessionId?: string): string {
    const filename = sessionId ? `${sessionId}.json` : "global.json";
    const resolved = path.resolve(path.join(this.directory, filename));
    const dirResolved = path.resolve(this.directory);
    if (!resolved.startsWith(dirResolved + path.sep)) {
      throw new Error("Invalid sessionId: path traversal detected");
    }
    return resolved;
  }

  private async withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.fileLocks.get(filePath) ?? Promise.resolve();
    let release: () => void;
    const next = new Promise<void>(r => { release = r; });
    const chain = prev.then(() => next);
    this.fileLocks.set(filePath, chain);
    await prev;
    try {
      return await fn();
    } finally {
      release!();
      if (this.fileLocks.get(filePath) === chain) {
        this.fileLocks.delete(filePath);
      }
    }
  }

  private async ensureDirectory(): Promise<void> {
    if (this.dirReady) return;
    await fs.mkdir(this.directory, { recursive: true });
    this.dirReady = true;
  }

  private async loadFile(filePath: string): Promise<MemoryEntry[]> {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as MemoryEntry[];
    } catch {
      return [];
    }
  }

  private async saveFile(filePath: string, entries: MemoryEntry[]): Promise<void> {
    await this.ensureDirectory();
    await fs.writeFile(filePath, JSON.stringify(entries, null, 2), "utf-8");
  }

  private async loadAllEntries(): Promise<MemoryEntry[]> {
    await this.ensureDirectory();
    let files: string[];
    try {
      files = await fs.readdir(this.directory);
    } catch {
      return [];
    }

    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const results = await Promise.all(
      jsonFiles.map((file) => this.loadFile(path.join(this.directory, file)))
    );
    return results.flat();
  }

  async store(entry: MemoryEntry): Promise<void> {
    const filePath = this.getFilePath(entry.sessionId);
    await this.withLock(filePath, async () => {
      const entries = await this.loadFile(filePath);
      const idx = entries.findIndex((e) => e.id === entry.id);
      if (idx !== -1) {
        entries[idx] = { ...entry };
      } else {
        entries.push({ ...entry });
      }
      await this.saveFile(filePath, entries);
    });
  }

  async recall(_query: string, options: RecallOptions = {}): Promise<MemoryEntry[]> {
    const {
      limit = 10,
      type,
      tier,
      includeTiers,
      sessionId,
      minImportance,
      query,
    } = options;
    const tierSet = includeTiers ? new Set(includeTiers) : undefined;

    let entries: MemoryEntry[];
    if (sessionId) {
      entries = await this.loadFile(this.getFilePath(sessionId));
    } else {
      entries = await this.loadAllEntries();
    }

    if (type) {
      entries = entries.filter((e) => e.type === type);
    }
    if (tier) {
      entries = entries.filter((e) => e.tier === tier);
    }
    if (tierSet) {
      entries = entries.filter((e) => e.tier && tierSet.has(e.tier));
    }
    if (sessionId) {
      entries = entries.filter((e) => e.sessionId === sessionId);
    }
    if (minImportance !== undefined) {
      entries = entries.filter((e) => (e.importance ?? 0) >= minImportance);
    }
    if (query) {
      const lower = query.toLowerCase();
      entries = entries.filter((e) => e.content.toLowerCase().includes(lower));
    }

    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return entries.slice(0, limit);
  }

  async summarize(entries: MemoryEntry[]): Promise<string> {
    const combined = entries.map((e) => e.content).join("\n");
    return combined.length > SUMMARY_MAX_LENGTH ? combined.slice(0, SUMMARY_MAX_LENGTH) + "..." : combined;
  }

  async clear(): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(this.directory);
    } catch {
      return;
    }
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      await fs.unlink(path.join(this.directory, file));
    }
  }

  async getStats(): Promise<MemoryStats> {
    const all = await this.loadAllEntries();
    return calculateMemoryStats(all);
  }
}
