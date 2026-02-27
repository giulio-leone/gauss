// =============================================================================
// DocumentPort — Extraction, transformation, chunking
// =============================================================================

export interface Document {
  /** Unique document ID */
  id: string;
  /** Text content */
  content: string;
  /** Source information */
  source: string;
  /** Chunk position (if chunked) */
  chunkIndex?: number;
  /** Total chunks in source */
  totalChunks?: number;
  /** Metadata chain (preserved through pipeline) */
  metadata: Record<string, unknown>;
}

export interface ChunkOptions {
  /** Target chunk size in characters */
  chunkSize?: number;
  /** Overlap between chunks in characters */
  chunkOverlap?: number;
  /** Separator to split on */
  separator?: string;
}

export interface DocumentPort {
  /** Extract text from a source (path, URL, raw content) */
  extract(source: string, mimeType?: string): Promise<Document[]>;

  /** Transform documents (clean, normalize, enrich) */
  transform(documents: Document[]): Promise<Document[]>;

  /** Split documents into chunks */
  chunk(documents: Document[], options?: ChunkOptions): Promise<Document[]>;
}
