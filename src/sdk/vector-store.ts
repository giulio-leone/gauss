/**
 * VectorStore SDK wrapper — in-memory RAG vector store backed by Rust core.
 */
import {
  create_vector_store,
  vector_store_upsert,
  vector_store_search,
  destroy_vector_store,
  cosine_similarity,
} from "gauss-napi";

import type {
  Handle,
  Disposable,
  VectorChunk,
  SearchResult,
} from "./types.js";

export class VectorStore implements Disposable {
  private readonly _handle: Handle;
  private disposed = false;

  constructor(_options?: { dimensions?: number }) {
    this._handle = create_vector_store();
  }

  get handle(): Handle {
    return this._handle;
  }

  async upsert(chunks: VectorChunk[]): Promise<void> {
    this.assertNotDisposed();
    // Convert camelCase to snake_case for Rust serde
    const rustChunks = chunks.map((c) => ({
      id: c.id,
      document_id: c.documentId,
      content: c.content,
      index: c.index,
      metadata: c.metadata ?? {},
      embedding: c.embedding,
    }));
    return vector_store_upsert(this._handle, JSON.stringify(rustChunks));
  }

  async search(embedding: number[], topK: number): Promise<SearchResult[]> {
    this.assertNotDisposed();
    return vector_store_search(
      this._handle,
      JSON.stringify(embedding),
      topK
    ) as Promise<SearchResult[]>;
  }

  /**
   * Search by text query with auto-embedding via a provider.
   */
  async searchByText(
    query: string,
    topK: number,
    embedFn: (text: string) => Promise<number[]>
  ): Promise<SearchResult[]> {
    this.assertNotDisposed();
    const embedding = await embedFn(query);
    return this.search(embedding, topK);
  }

  destroy(): void {
    if (!this.disposed) {
      this.disposed = true;
      try {
        destroy_vector_store(this._handle);
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
      throw new Error("VectorStore has been destroyed");
    }
  }

  static cosineSimilarity(a: number[], b: number[]): number {
    return cosine_similarity(a, b);
  }
}
