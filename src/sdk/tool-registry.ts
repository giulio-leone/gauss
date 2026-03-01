/**
 * ToolRegistry SDK — searchable tool registry with tags, examples, and batch execution.
 */
import {
  createToolRegistry,
  toolRegistryAdd,
  toolRegistrySearch,
  toolRegistryByTag,
  toolRegistryList,
  destroyToolRegistry,
} from "gauss-napi";

import type { Handle, Disposable } from "./types.js";

// ── Types ───────────────────────────────────────────────────────

export interface ToolExample {
  description: string;
  input: unknown;
  expectedOutput?: unknown;
}

export interface ToolRegistryEntry {
  name: string;
  description: string;
  tags?: string[];
  examples?: ToolExample[];
}

export interface ToolSearchResult {
  name: string;
  description: string;
  tags: string[];
}

// ── ToolRegistry Class ──────────────────────────────────────────

export class ToolRegistry implements Disposable {
  private readonly _handle: Handle;
  private disposed = false;

  constructor() {
    this._handle = createToolRegistry();
  }

  get handle(): Handle {
    return this._handle;
  }

  /** Register a tool with optional tags and examples. */
  add(entry: ToolRegistryEntry): this {
    this.assertNotDisposed();
    toolRegistryAdd(this._handle, JSON.stringify(entry));
    return this;
  }

  /** Search tools by query (matches name, description, tags). */
  search(query: string): ToolSearchResult[] {
    this.assertNotDisposed();
    return toolRegistrySearch(this._handle, query) as ToolSearchResult[];
  }

  /** Find tools by tag. */
  byTag(tag: string): ToolSearchResult[] {
    this.assertNotDisposed();
    return toolRegistryByTag(this._handle, tag) as ToolSearchResult[];
  }

  /** List all registered tools. */
  list(): ToolRegistryEntry[] {
    this.assertNotDisposed();
    return toolRegistryList(this._handle) as ToolRegistryEntry[];
  }

  destroy(): void {
    if (!this.disposed) {
      this.disposed = true;
      try {
        destroyToolRegistry(this._handle);
      } catch {
        // Already destroyed.
      }
    }
  }

  [Symbol.dispose](): void {
    this.destroy();
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("ToolRegistry has been destroyed");
    }
  }
}
