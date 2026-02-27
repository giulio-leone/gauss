// =============================================================================
// Graph-RAG Tests — Knowledge graph, entity extraction, GraphRAG pipeline
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";

import type { GraphNode, GraphEdge } from "../../ports/knowledge-graph.port.js";
import { InMemoryKnowledgeGraphAdapter } from "../../adapters/knowledge-graph/inmemory.adapter.js";
import { PatternEntityExtractorAdapter, DEFAULT_ENTITY_PATTERNS } from "../../adapters/entity-extractor/pattern.adapter.js";
import type { ExtractionResult } from "../../ports/entity-extractor.port.js";
import { GraphRAGPipeline } from "../graph-rag.pipeline.js";
import type { DocumentPort } from "../../ports/document.port.js";
import type { EmbeddingPort, EmbeddingResult } from "../../ports/embedding.port.js";
import { InMemoryVectorStore } from "../../adapters/vector-store/inmemory.adapter.js";

// =============================================================================
// Knowledge Graph Tests
// =============================================================================

describe("InMemoryKnowledgeGraphAdapter", () => {
  let graph: InMemoryKnowledgeGraphAdapter;

  const nodes: GraphNode[] = [
    { id: "a", type: "PERSON", properties: { name: "Alice" } },
    { id: "b", type: "PERSON", properties: { name: "Bob" } },
    { id: "c", type: "ORG", properties: { name: "Acme" } },
    { id: "d", type: "PERSON", properties: { name: "Dave" } },
    { id: "e", type: "PERSON", properties: { name: "Eve" } },
  ];

  const edges: GraphEdge[] = [
    { source: "a", target: "b", type: "KNOWS", weight: 1, properties: {} },
    { source: "b", target: "c", type: "WORKS_AT", weight: 1, properties: {} },
    { source: "c", target: "d", type: "EMPLOYS", weight: 1, properties: {} },
    { source: "a", target: "e", type: "KNOWS", weight: 2, properties: {} },
    { source: "e", target: "d", type: "KNOWS", weight: 1, properties: {} },
  ];

  beforeEach(async () => {
    graph = new InMemoryKnowledgeGraphAdapter();
    await graph.addNodes(nodes);
    await graph.addEdges(edges);
  });

  it("addNodes and getNode", async () => {
    const node = await graph.getNode("a");
    expect(node).toBeDefined();
    expect(node!.type).toBe("PERSON");
    expect(node!.properties.name).toBe("Alice");
  });

  it("getNode returns undefined for missing", async () => {
    expect(await graph.getNode("missing")).toBeUndefined();
  });

  it("stats counts nodes and edges", async () => {
    const s = await graph.stats();
    expect(s.nodeCount).toBe(5);
    expect(s.edgeCount).toBe(5);
  });

  it("getNeighbors depth=1", async () => {
    const neighbors = await graph.getNeighbors("a", 1);
    const ids = neighbors.map((n) => n.id).sort();
    expect(ids).toEqual(["b", "e"]);
  });

  it("getNeighbors depth=2", async () => {
    const neighbors = await graph.getNeighbors("a", 2);
    const ids = neighbors.map((n) => n.id).sort();
    expect(ids).toEqual(["b", "c", "d", "e"]);
  });

  it("query with edgeTypes filter", async () => {
    const result = await graph.query({ startNodeId: "a", maxDepth: 3, edgeTypes: ["KNOWS"] });
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toContain("b");
    expect(ids).toContain("e");
    expect(ids).toContain("d");
    // Should NOT reach c via WORKS_AT
    expect(ids).not.toContain("c");
  });

  it("query with nodeTypes filter", async () => {
    const result = await graph.query({ startNodeId: "a", maxDepth: 3, nodeTypes: ["PERSON"] });
    const ids = result.nodes.map((n) => n.id).sort();
    for (const n of result.nodes) {
      expect(n.type).toBe("PERSON");
    }
    expect(ids).not.toContain("c"); // ORG excluded
  });

  it("query with limit", async () => {
    const result = await graph.query({ startNodeId: "a", maxDepth: 5, limit: 3 });
    expect(result.nodes.length).toBeLessThanOrEqual(3);
  });

  it("shortestPath finds path", async () => {
    const path = await graph.shortestPath("a", "d");
    expect(path.length).toBeGreaterThan(0);
    expect(path[0].id).toBe("a");
    expect(path[path.length - 1].id).toBe("d");
  });

  it("shortestPath returns empty for unreachable", async () => {
    // Add isolated node
    await graph.addNodes([{ id: "z", type: "ISOLATED", properties: {} }]);
    const path = await graph.shortestPath("a", "z");
    expect(path).toEqual([]);
  });

  it("shortestPath same node returns [node]", async () => {
    const path = await graph.shortestPath("a", "a");
    expect(path).toHaveLength(1);
    expect(path[0].id).toBe("a");
  });

  it("subgraph extracts subset", async () => {
    const sub = await graph.subgraph(["a", "b"]);
    expect(sub.nodes).toHaveLength(2);
    expect(sub.edges).toHaveLength(1);
    expect(sub.edges[0].source).toBe("a");
    expect(sub.edges[0].target).toBe("b");
  });

  it("removeNodes cleans up edges", async () => {
    await graph.removeNodes(["b"]);
    const s = await graph.stats();
    expect(s.nodeCount).toBe(4);
    expect(await graph.getNode("b")).toBeUndefined();
    // edges from/to b should be gone
    const neighbors = await graph.getNeighbors("a", 1);
    expect(neighbors.map((n) => n.id)).not.toContain("b");
  });

  it("removeEdges", async () => {
    await graph.removeEdges([{ source: "a", target: "b" }]);
    const s = await graph.stats();
    expect(s.edgeCount).toBe(4);
    const neighbors = await graph.getNeighbors("a", 1);
    expect(neighbors.map((n) => n.id)).not.toContain("b");
  });

  it("clear empties everything", async () => {
    await graph.clear();
    const s = await graph.stats();
    expect(s.nodeCount).toBe(0);
    expect(s.edgeCount).toBe(0);
  });

  it("ignores edges with non-existent nodes", async () => {
    const g = new InMemoryKnowledgeGraphAdapter();
    await g.addNodes([{ id: "x", type: "T", properties: {} }]);
    await g.addEdges([{ source: "x", target: "y", type: "R", weight: 1, properties: {} }]);
    const s = await g.stats();
    expect(s.edgeCount).toBe(0);
  });
});

// =============================================================================
// Entity Extractor Tests
// =============================================================================

describe("PatternEntityExtractorAdapter", () => {
  it("extracts persons", async () => {
    const extractor = new PatternEntityExtractorAdapter();
    const result = await extractor.extract("Alice Johnson and Bob Smith went to the meeting.");
    const names = result.entities.filter((e) => e.type === "PERSON").map((e) => e.name);
    expect(names).toContain("Alice Johnson");
    expect(names).toContain("Bob Smith");
  });

  it("extracts emails", async () => {
    const extractor = new PatternEntityExtractorAdapter();
    const result = await extractor.extract("Contact us at test@example.com or info@corp.org");
    const emails = result.entities.filter((e) => e.type === "EMAIL").map((e) => e.name);
    expect(emails).toContain("test@example.com");
    expect(emails).toContain("info@corp.org");
  });

  it("extracts dates", async () => {
    const extractor = new PatternEntityExtractorAdapter();
    const result = await extractor.extract("The event is on 2025-01-15 and 2025-03-20.");
    const dates = result.entities.filter((e) => e.type === "DATE").map((e) => e.name);
    expect(dates).toContain("2025-01-15");
    expect(dates).toContain("2025-03-20");
  });

  it("deduplicates entities", async () => {
    const extractor = new PatternEntityExtractorAdapter();
    const result = await extractor.extract("Alice Johnson met Alice Johnson again.");
    const alices = result.entities.filter((e) => e.name === "Alice Johnson");
    expect(alices).toHaveLength(1);
  });

  it("custom entity patterns", async () => {
    const extractor = new PatternEntityExtractorAdapter({
      entityPatterns: [{ type: "HASHTAG", pattern: /#(\w+)/g }],
    });
    const result = await extractor.extract("Check #typescript and #nodejs");
    expect(result.entities.map((e) => e.name)).toEqual(["typescript", "nodejs"]);
  });

  it("relation patterns", async () => {
    const extractor = new PatternEntityExtractorAdapter({
      entityPatterns: DEFAULT_ENTITY_PATTERNS,
      relationPatterns: [
        { pattern: /(\w+ \w+) works at (\w+ \w+)/g, type: "WORKS_AT", sourceGroup: 1, targetGroup: 2, confidence: 0.9 },
      ],
    });
    const result = await extractor.extract("Alice Johnson works at Acme Corp in the city.");
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].type).toBe("WORKS_AT");
    expect(result.relations[0].source).toBe("Alice Johnson");
    expect(result.relations[0].target).toBe("Acme Corp");
    expect(result.relations[0].confidence).toBe(0.9);
  });

  it("returns empty for no matches", async () => {
    const extractor = new PatternEntityExtractorAdapter({ entityPatterns: [] });
    const result = await extractor.extract("nothing to see here");
    expect(result.entities).toEqual([]);
    expect(result.relations).toEqual([]);
  });
});

// =============================================================================
// GraphRAG Pipeline Tests
// =============================================================================

function randomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

function mockDocumentPort(): DocumentPort {
  return {
    async extract(source) {
      return [{ id: source, content: source, source, metadata: {} }];
    },
    async transform(docs) {
      return docs;
    },
    async chunk(docs) {
      return docs.map((d, i) => ({ ...d, chunkIndex: i, totalChunks: docs.length }));
    },
  };
}

const DIM = 32;

function mockEmbeddingPort(): EmbeddingPort {
  return {
    dimensions: DIM,
    modelId: "mock",
    async embed(_text: string): Promise<EmbeddingResult> {
      return { embedding: randomVector(DIM), tokenCount: 4 };
    },
    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
      return texts.map(() => ({ embedding: randomVector(DIM), tokenCount: 4 }));
    },
  };
}

describe("GraphRAGPipeline", () => {
  let pipeline: GraphRAGPipeline;
  let graphPort: InMemoryKnowledgeGraphAdapter;

  beforeEach(() => {
    graphPort = new InMemoryKnowledgeGraphAdapter();
    pipeline = new GraphRAGPipeline({
      documentPort: mockDocumentPort(),
      embeddingPort: mockEmbeddingPort(),
      vectorStorePort: new InMemoryVectorStore(),
      graphPort,
      entityExtractor: new PatternEntityExtractorAdapter({
        entityPatterns: [{ type: "PERSON", pattern: /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g }],
        relationPatterns: [
          { pattern: /([A-Z][a-z]+ [A-Z][a-z]+) (?:knows|met) ([A-Z][a-z]+ [A-Z][a-z]+)/g, type: "KNOWS", sourceGroup: 1, targetGroup: 2 },
        ],
      }),
    });
  });

  it("ingest extracts entities and builds graph", async () => {
    const result = await pipeline.ingest("Alice Johnson met Bob Smith at the conference.");
    expect(result.documentsProcessed).toBe(1);
    expect(result.chunksCreated).toBe(1);
    expect(result.entitiesExtracted).toBe(2);
    expect(result.relationsExtracted).toBe(1);
    expect(result.graphNodesAdded).toBeGreaterThanOrEqual(3); // 2 entities + 1 chunk
    expect(result.graphEdgesAdded).toBeGreaterThanOrEqual(3); // 1 KNOWS + 2 MENTIONED_IN

    const stats = await graphPort.stats();
    expect(stats.nodeCount).toBeGreaterThanOrEqual(3);
    expect(stats.edgeCount).toBeGreaterThanOrEqual(3);
  });

  it("query returns hybrid-scored results", async () => {
    await pipeline.ingest("Alice Johnson met Bob Smith at the conference.");
    await pipeline.ingest("Charlie Brown works at Acme Corp daily.");

    const result = await pipeline.query("Who is Alice Johnson?");
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.hybridScore).toBeGreaterThanOrEqual(0);
      expect(typeof r.graphScore).toBe("number");
    }
  });

  it("query returns graph context", async () => {
    await pipeline.ingest("Alice Johnson met Bob Smith at the meeting.");
    const result = await pipeline.query("Alice Johnson");
    // Graph context should contain entities
    expect(result.graphContext).toBeDefined();
    expect(result.context).toBeDefined();
    expect(result.totalTokensUsed).toBeGreaterThan(0);
  });

  it("query with no graph matches returns results with zero graph score", async () => {
    await pipeline.ingest("some random text without named entities");
    const result = await pipeline.query("random text");
    // With random embeddings, may or may not have results — but any result should have graphScore=0
    for (const r of result.results) {
      expect(r.graphScore).toBe(0);
    }
    // At minimum, the query shouldn't throw
    expect(result.context).toBeDefined();
  });

  it("ingest multiple documents builds connected graph", async () => {
    await pipeline.ingest("Alice Johnson knows Bob Smith very well.");
    await pipeline.ingest("Bob Smith met Charlie Brown at lunch.");

    // Bob Smith should connect Alice and Charlie through the graph
    const bobNode = await graphPort.getNode("PERSON::Bob Smith");
    expect(bobNode).toBeDefined();

    const neighbors = await graphPort.getNeighbors("PERSON::Bob Smith", 1);
    const neighborIds = neighbors.map((n) => n.id);
    // Bob should be connected to chunks and to Alice/Charlie via edges
    expect(neighborIds.length).toBeGreaterThan(0);
  });

  it("respects maxResults", async () => {
    const smallPipeline = new GraphRAGPipeline({
      documentPort: mockDocumentPort(),
      embeddingPort: mockEmbeddingPort(),
      vectorStorePort: new InMemoryVectorStore(),
      graphPort: new InMemoryKnowledgeGraphAdapter(),
      entityExtractor: new PatternEntityExtractorAdapter(),
      maxResults: 2,
    });

    for (let i = 0; i < 10; i++) {
      await smallPipeline.ingest(`Document number ${i} about Alice Johnson.`);
    }

    const result = await smallPipeline.query("Alice Johnson");
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  it("hybrid scoring boosts graph-connected results", async () => {
    // Create a pipeline with strong graph weight
    const strongGraphPipeline = new GraphRAGPipeline({
      documentPort: mockDocumentPort(),
      embeddingPort: mockEmbeddingPort(),
      vectorStorePort: new InMemoryVectorStore(),
      graphPort,
      entityExtractor: new PatternEntityExtractorAdapter({
        entityPatterns: [{ type: "PERSON", pattern: /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g }],
      }),
      vectorWeight: 0.3,
      graphWeight: 0.7,
    });

    await strongGraphPipeline.ingest("Alice Johnson is a software engineer.");
    await strongGraphPipeline.ingest("Random text without entities.");

    const result = await strongGraphPipeline.query("Alice Johnson");
    // The result mentioning Alice should have a non-zero graph score
    const aliceResult = result.results.find((r) => r.content.includes("Alice"));
    if (aliceResult) {
      expect(aliceResult.graphScore).toBe(1.0);
      expect(aliceResult.hybridScore).toBeGreaterThan(aliceResult.score * 0.3);
    }
  });
});
