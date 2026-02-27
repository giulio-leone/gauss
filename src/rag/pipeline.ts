// =============================================================================
// RAG Pipeline — Extract → Transform → Chunk → Embed → Store → Query
// =============================================================================

import type { DocumentPort, Document, ChunkOptions } from "../ports/document.port.js";
import type { EmbeddingPort } from "../ports/embedding.port.js";
import type { VectorStorePort, VectorSearchResult, VectorFilter } from "../ports/vector-store.port.js";

// =============================================================================
// Configuration
// =============================================================================

export interface RAGPipelineConfig {
  documentPort: DocumentPort;
  embeddingPort: EmbeddingPort;
  vectorStorePort: VectorStorePort;
  chunkOptions?: ChunkOptions;
  /** Minimum relevance score (0-1) for query results */
  minRelevance?: number;
  /** Maximum results to return */
  maxResults?: number;
  /** Diversity threshold — skip results too similar to already selected */
  diversityThreshold?: number;
}

export interface IngestResult {
  documentsProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  totalTokens: number;
}

export interface QueryResult {
  results: VectorSearchResult[];
  /** Formatted context string for prompt injection */
  context: string;
  totalTokensUsed: number;
}

// =============================================================================
// Pipeline
// =============================================================================

export class RAGPipeline {
  private readonly config: RAGPipelineConfig;

  constructor(config: RAGPipelineConfig) {
    this.config = config;
  }

  /** Ingest: extract → transform → chunk → embed → store */
  async ingest(source: string, mimeType?: string): Promise<IngestResult> {
    const { documentPort, embeddingPort, vectorStorePort, chunkOptions } = this.config;

    // Extract
    const rawDocs = await documentPort.extract(source, mimeType);

    // Transform
    const transformed = await documentPort.transform(rawDocs);

    // Chunk
    const chunks = await documentPort.chunk(transformed, chunkOptions);

    // Embed in batches
    const batchSize = 32;
    let totalTokens = 0;
    const vectorDocs = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await embeddingPort.embedBatch(
        batch.map((c) => c.content),
      );

      for (let j = 0; j < batch.length; j++) {
        totalTokens += embeddings[j].tokenCount;
        vectorDocs.push({
          id: batch[j].id,
          embedding: embeddings[j].embedding,
          content: batch[j].content,
          metadata: {
            ...batch[j].metadata,
            source: batch[j].source,
            chunkIndex: batch[j].chunkIndex,
            totalChunks: batch[j].totalChunks,
          },
        });
      }
    }

    // Store
    await vectorStorePort.upsert(vectorDocs);

    return {
      documentsProcessed: rawDocs.length,
      chunksCreated: chunks.length,
      embeddingsGenerated: vectorDocs.length,
      totalTokens,
    };
  }

  /** Query: embed query → vector search → filter → format context */
  async query(
    queryText: string,
    options?: { filter?: VectorFilter; topK?: number },
  ): Promise<QueryResult> {
    const { embeddingPort, vectorStorePort } = this.config;
    const topK = options?.topK ?? this.config.maxResults ?? 5;
    const minScore = this.config.minRelevance ?? 0;

    // Embed query
    const queryEmb = await embeddingPort.embed(queryText);

    // Search
    let results = await vectorStorePort.query({
      embedding: queryEmb.embedding,
      topK: topK * 2, // Over-fetch for diversity filtering
      minScore,
      filter: options?.filter,
    });

    // Diversity filter
    if (this.config.diversityThreshold !== undefined) {
      results = this.applyDiversity(results, this.config.diversityThreshold);
    }

    results = results.slice(0, topK);

    // Format context
    const context = results
      .map((r, i) => `[Source ${i + 1}] (score: ${r.score.toFixed(3)})\n${r.content}`)
      .join("\n\n---\n\n");

    return {
      results,
      context,
      totalTokensUsed: queryEmb.tokenCount,
    };
  }

  private applyDiversity(
    results: VectorSearchResult[],
    threshold: number,
  ): VectorSearchResult[] {
    const selected: VectorSearchResult[] = [];
    for (const r of results) {
      const tooSimilar = selected.some(
        (s) => Math.abs(s.score - r.score) < threshold && s.content === r.content,
      );
      if (!tooSimilar) {
        selected.push(r);
      }
    }
    return selected;
  }
}
