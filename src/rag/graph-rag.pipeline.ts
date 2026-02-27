// =============================================================================
// GraphRAG Pipeline — Entity extraction → Knowledge graph → Hybrid retrieval
// =============================================================================

import type { DocumentPort } from "../ports/document.port.js";
import type { EmbeddingPort } from "../ports/embedding.port.js";
import type { VectorStorePort, VectorSearchResult, VectorFilter } from "../ports/vector-store.port.js";
import type { KnowledgeGraphPort, GraphNode, GraphEdge } from "../ports/knowledge-graph.port.js";
import type { EntityExtractorPort } from "../ports/entity-extractor.port.js";
import type { ChunkOptions } from "../ports/document.port.js";

// =============================================================================
// Configuration
// =============================================================================

export interface GraphRAGConfig {
  documentPort: DocumentPort;
  embeddingPort: EmbeddingPort;
  vectorStorePort: VectorStorePort;
  graphPort: KnowledgeGraphPort;
  entityExtractor: EntityExtractorPort;
  chunkOptions?: ChunkOptions;
  /** Weight for vector similarity in hybrid scoring (0-1, default 0.6) */
  vectorWeight?: number;
  /** Weight for graph proximity in hybrid scoring (0-1, default 0.4) */
  graphWeight?: number;
  /** Max graph traversal depth for context expansion (default 2) */
  maxGraphDepth?: number;
  /** Minimum relevance score for results (default 0) */
  minRelevance?: number;
  /** Maximum results (default 10) */
  maxResults?: number;
}

export interface GraphIngestResult {
  documentsProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  entitiesExtracted: number;
  relationsExtracted: number;
  graphNodesAdded: number;
  graphEdgesAdded: number;
  totalTokens: number;
}

export interface GraphQueryResult {
  results: Array<VectorSearchResult & { graphScore: number; hybridScore: number }>;
  /** Graph context: related entities and relations */
  graphContext: { nodes: GraphNode[]; edges: GraphEdge[] };
  /** Formatted context for prompt injection */
  context: string;
  totalTokensUsed: number;
}

// =============================================================================
// Pipeline
// =============================================================================

export class GraphRAGPipeline {
  private readonly config: Required<
    Pick<GraphRAGConfig, "vectorWeight" | "graphWeight" | "maxGraphDepth" | "minRelevance" | "maxResults">
  > & GraphRAGConfig;

  constructor(config: GraphRAGConfig) {
    this.config = {
      ...config,
      vectorWeight: config.vectorWeight ?? 0.6,
      graphWeight: config.graphWeight ?? 0.4,
      maxGraphDepth: config.maxGraphDepth ?? 2,
      minRelevance: config.minRelevance ?? 0,
      maxResults: config.maxResults ?? 10,
    };
    const wSum = this.config.vectorWeight + this.config.graphWeight;
    if (this.config.vectorWeight < 0 || this.config.graphWeight < 0) {
      throw new Error("vectorWeight and graphWeight must be non-negative");
    }
    if (Math.abs(wSum - 1.0) > 0.001) {
      throw new Error(`vectorWeight + graphWeight must sum to 1.0 (got ${wSum})`);
    }
  }

  /** Ingest: extract → chunk → embed → store + entity extraction → graph build */
  async ingest(source: string, mimeType?: string): Promise<GraphIngestResult> {
    const { documentPort, embeddingPort, vectorStorePort, graphPort, entityExtractor, chunkOptions } = this.config;

    // Extract & transform & chunk
    const rawDocs = await documentPort.extract(source, mimeType);
    const transformed = await documentPort.transform(rawDocs);
    const chunks = await documentPort.chunk(transformed, chunkOptions);

    // Embed and store in vector store
    const batchSize = 32;
    let totalTokens = 0;
    const vectorDocs = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await embeddingPort.embedBatch(batch.map((c) => c.content));
      for (let j = 0; j < batch.length; j++) {
        totalTokens += embeddings[j].tokenCount;
        vectorDocs.push({
          id: batch[j].id,
          embedding: embeddings[j].embedding,
          content: batch[j].content,
          metadata: { ...batch[j].metadata, source: batch[j].source, chunkIndex: batch[j].chunkIndex },
        });
      }
    }
    await vectorStorePort.upsert(vectorDocs);

    // Entity extraction + graph building
    let totalEntities = 0;
    let totalRelations = 0;
    const allNodes: GraphNode[] = [];
    const allEdges: GraphEdge[] = [];
    const seenNodeIds = new Set<string>();

    for (const chunk of chunks) {
      const { entities, relations } = await entityExtractor.extract(chunk.content);
      totalEntities += entities.length;
      totalRelations += relations.length;

      // Create graph nodes from entities
      for (const entity of entities) {
        const nodeId = `${entity.type}::${entity.name}`;
        if (!seenNodeIds.has(nodeId)) {
          seenNodeIds.add(nodeId);
          allNodes.push({
            id: nodeId,
            type: entity.type,
            properties: { ...entity.properties, name: entity.name },
          });
        }
      }

      // Create graph edges from relations
      for (const rel of relations) {
        // Find matching entity types for source/target (case-insensitive)
        const srcEntity = entities.find((e) => e.name.toLowerCase().trim() === rel.source.toLowerCase().trim());
        const tgtEntity = entities.find((e) => e.name.toLowerCase().trim() === rel.target.toLowerCase().trim());
        const sourceId = srcEntity ? `${srcEntity.type}::${srcEntity.name}` : `UNKNOWN::${rel.source}`;
        const targetId = tgtEntity ? `${tgtEntity.type}::${tgtEntity.name}` : `UNKNOWN::${rel.target}`;

        // Ensure nodes exist for relation endpoints
        if (!seenNodeIds.has(sourceId)) {
          seenNodeIds.add(sourceId);
          allNodes.push({ id: sourceId, type: srcEntity?.type ?? "UNKNOWN", properties: { name: rel.source } });
        }
        if (!seenNodeIds.has(targetId)) {
          seenNodeIds.add(targetId);
          allNodes.push({ id: targetId, type: tgtEntity?.type ?? "UNKNOWN", properties: { name: rel.target } });
        }

        allEdges.push({
          source: sourceId,
          target: targetId,
          type: rel.type,
          weight: rel.confidence,
          properties: { sourceChunkId: chunk.id },
        });
      }

      // Link chunk to its entities via "MENTIONED_IN" edges
      const chunkNodeId = `CHUNK::${chunk.id}`;
      if (!seenNodeIds.has(chunkNodeId)) {
        seenNodeIds.add(chunkNodeId);
        allNodes.push({ id: chunkNodeId, type: "CHUNK", properties: { content: chunk.content.slice(0, 200) } });
      }
      for (const entity of entities) {
        const entityNodeId = `${entity.type}::${entity.name}`;
        allEdges.push({
          source: entityNodeId,
          target: chunkNodeId,
          type: "MENTIONED_IN",
          weight: 1.0,
          properties: {},
        });
      }
    }

    if (allNodes.length > 0) await graphPort.addNodes(allNodes);
    if (allEdges.length > 0) await graphPort.addEdges(allEdges);

    return {
      documentsProcessed: rawDocs.length,
      chunksCreated: chunks.length,
      embeddingsGenerated: vectorDocs.length,
      entitiesExtracted: totalEntities,
      relationsExtracted: totalRelations,
      graphNodesAdded: allNodes.length,
      graphEdgesAdded: allEdges.length,
      totalTokens,
    };
  }

  /** Query: vector search + entity extraction from query + graph expansion + hybrid scoring */
  async query(queryText: string, options?: { filter?: VectorFilter; topK?: number }): Promise<GraphQueryResult> {
    const { embeddingPort, vectorStorePort, graphPort, entityExtractor, vectorWeight, graphWeight, maxGraphDepth, maxResults, minRelevance } = this.config;
    const topK = options?.topK ?? maxResults;

    // 1. Vector search
    const queryEmb = await embeddingPort.embed(queryText);
    const vectorResults = await vectorStorePort.query({
      embedding: queryEmb.embedding,
      topK: topK * 3, // Over-fetch for hybrid scoring
      minScore: minRelevance,
      filter: options?.filter,
    });

    // 2. Extract entities from query for graph traversal
    const queryExtraction = await entityExtractor.extract(queryText);
    const queryEntityIds = queryExtraction.entities.map((e) => `${e.type}::${e.name}`);

    // 3. Graph expansion: find neighbors of query entities
    const graphNodes: GraphNode[] = [];
    const graphEdges: GraphEdge[] = [];
    const relatedChunkIds = new Set<string>();

    for (const entityId of queryEntityIds) {
      const node = await graphPort.getNode(entityId);
      if (!node) continue;
      graphNodes.push(node);

      const subgraph = await graphPort.query({
        startNodeId: entityId,
        maxDepth: maxGraphDepth,
      });
      for (const n of subgraph.nodes) {
        if (!graphNodes.some((gn) => gn.id === n.id)) graphNodes.push(n);
        if (n.type === "CHUNK") relatedChunkIds.add(n.id.replace("CHUNK::", ""));
      }
      for (const e of subgraph.edges) graphEdges.push(e);
    }

    // 4. Hybrid scoring: combine vector similarity + graph proximity
    const hybridResults = vectorResults.map((vr) => {
      const chunkId = vr.id;
      const isGraphRelated = relatedChunkIds.has(chunkId);
      const graphScore = isGraphRelated ? 1.0 : 0.0;
      const hybridScore = vectorWeight * vr.score + graphWeight * graphScore;
      return { ...vr, graphScore, hybridScore };
    });

    // Sort by hybrid score descending and limit
    hybridResults.sort((a, b) => b.hybridScore - a.hybridScore);
    const finalResults = hybridResults.slice(0, topK);

    // 5. Format context
    const graphSummary = graphNodes.length > 0
      ? `\n\n[Knowledge Graph Context]\nEntities: ${graphNodes.filter((n) => n.type !== "CHUNK").map((n) => `${n.properties.name} (${n.type})`).join(", ")}\nRelations: ${graphEdges.filter((e) => e.type !== "MENTIONED_IN").map((e) => `${e.source} -[${e.type}]-> ${e.target}`).join(", ")}`
      : "";

    const vectorContext = finalResults
      .map((r, i) => `[Source ${i + 1}] (hybrid: ${r.hybridScore.toFixed(3)}, vec: ${r.score.toFixed(3)}, graph: ${r.graphScore.toFixed(1)})\n${r.content}`)
      .join("\n\n---\n\n");

    const context = graphSummary + (graphSummary ? "\n\n" : "") + vectorContext;

    return {
      results: finalResults,
      graphContext: { nodes: graphNodes, edges: graphEdges },
      context,
      totalTokensUsed: queryEmb.tokenCount,
    };
  }
}
