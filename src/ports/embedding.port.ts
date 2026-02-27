// =============================================================================
// EmbeddingPort — Provider-agnostic embedding generation
// =============================================================================

export interface EmbeddingResult {
  /** Float vector */
  embedding: number[];
  /** Token count consumed */
  tokenCount: number;
}

export interface EmbeddingPort {
  /** Embed a single text string */
  embed(text: string): Promise<EmbeddingResult>;

  /** Embed multiple texts in batch */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /** Embedding dimensionality */
  readonly dimensions: number;

  /** Model identifier */
  readonly modelId: string;
}
