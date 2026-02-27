// =============================================================================
// VectorStorePort — Vector storage with hybrid search & metadata filtering
// =============================================================================

// =============================================================================
// Core types
// =============================================================================

export interface VectorDocument {
  id: string;
  embedding: number[];
  content: string;
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  embedding?: number[];
}

export interface VectorIndexStats {
  totalDocuments: number;
  dimensions: number;
  indexType: string;
}

// =============================================================================
// Filter — MongoDB-style metadata filtering
// =============================================================================

export type VectorFilter =
  | { $and: VectorFilter[] }
  | { $or: VectorFilter[] }
  | { $not: VectorFilter }
  | Record<string, unknown | { $eq: unknown } | { $ne: unknown } | { $gt: number } | { $gte: number } | { $lt: number } | { $lte: number } | { $in: unknown[] } | { $nin: unknown[] }>;

// =============================================================================
// Search params
// =============================================================================

export interface VectorSearchParams {
  /** Query vector */
  embedding: number[];
  /** Max results */
  topK: number;
  /** Minimum similarity threshold (0-1) */
  minScore?: number;
  /** Metadata filter */
  filter?: VectorFilter;
  /** Include embedding vectors in results */
  includeEmbeddings?: boolean;
}

// =============================================================================
// Port interface
// =============================================================================

export interface VectorStorePort {
  /** Upsert documents (insert or update) */
  upsert(documents: VectorDocument[]): Promise<void>;

  /** Search by vector similarity */
  query(params: VectorSearchParams): Promise<VectorSearchResult[]>;

  /** Delete documents by ID */
  delete(ids: string[]): Promise<void>;

  /** Get index statistics */
  indexStats(): Promise<VectorIndexStats>;
}
