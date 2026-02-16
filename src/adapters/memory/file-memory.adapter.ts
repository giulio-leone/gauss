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

export interface FileMemoryAdapterOptions {
  directory?: string; // default: .gaussflow/memory/
}

export class FileMemoryAdapter implements AgentMemoryPort {
  private readonly directory: string;
  private readonly fileLocks = new Map<string, Promise<void>>();

  constructor(options: FileMemoryAdapterOptions = {}) {
    this.directory = options.directory ?? ".gaussflow/memory";
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
    this.fileLocks.set(filePath, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
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
    const all: MemoryEntry[] = [];
    for (const file of jsonFiles) {
      const entries = await this.loadFile(path.join(this.directory, file));
      all.push(...entries);
    }
    return all;
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
    const { limit = 10, type, sessionId, minImportance, query } = options;

    let entries: MemoryEntry[];
    if (sessionId) {
      entries = await this.loadFile(this.getFilePath(sessionId));
    } else {
      entries = await this.loadAllEntries();
    }

    if (type) {
      entries = entries.filter((e) => e.type === type);
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
    return combined.length > 500 ? combined.slice(0, 500) + "..." : combined;
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
