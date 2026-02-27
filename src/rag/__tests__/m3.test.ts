// =============================================================================
// Tests: M3 — RAG Pipeline, Vector Store, Embedding, Working Memory, Middleware
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryEmbeddingAdapter } from "../../adapters/embedding/inmemory.adapter.js";
import { InMemoryVectorStore } from "../../adapters/vector-store/inmemory.adapter.js";
import { MarkdownDocumentAdapter } from "../../adapters/document/markdown.adapter.js";
import { InMemoryWorkingMemory } from "../../adapters/working-memory/inmemory.adapter.js";
import { RAGPipeline } from "../../rag/pipeline.js";
import { createObservationalMemoryMiddleware } from "../../middleware/observational-memory.js";
import { createResultEvictionMiddleware } from "../../middleware/result-eviction.js";

// =============================================================================
// Embedding Adapter
// =============================================================================

describe("InMemoryEmbeddingAdapter", () => {
  it("generates embeddings with correct dimensions", async () => {
    const adapter = new InMemoryEmbeddingAdapter({ dimensions: 128 });
    const result = await adapter.embed("hello world");
    expect(result.embedding).toHaveLength(128);
    expect(result.tokenCount).toBeGreaterThan(0);
  });

  it("embedBatch returns one result per input", async () => {
    const adapter = new InMemoryEmbeddingAdapter();
    const results = await adapter.embedBatch(["a", "b", "c"]);
    expect(results).toHaveLength(3);
  });

  it("uses custom embedFn when provided", async () => {
    const adapter = new InMemoryEmbeddingAdapter({
      dimensions: 3,
      embedFn: (text) => [text.length, 0, 1],
    });
    const result = await adapter.embed("hi");
    expect(result.embedding).toEqual([2, 0, 1]);
  });

  it("produces normalized vectors by default", async () => {
    const adapter = new InMemoryEmbeddingAdapter({ dimensions: 64 });
    const result = await adapter.embed("test");
    const norm = Math.sqrt(
      result.embedding.reduce((sum, v) => sum + v * v, 0),
    );
    expect(norm).toBeCloseTo(1.0, 1);
  });
});

// =============================================================================
// Vector Store
// =============================================================================

describe("InMemoryVectorStore", () => {
  let store: InMemoryVectorStore;
  const vec1 = [1, 0, 0];
  const vec2 = [0, 1, 0];
  const vec3 = [0.9, 0.1, 0];

  beforeEach(async () => {
    store = new InMemoryVectorStore();
    await store.upsert([
      { id: "d1", embedding: vec1, content: "doc one", metadata: { category: "a", score: 10 } },
      { id: "d2", embedding: vec2, content: "doc two", metadata: { category: "b", score: 20 } },
      { id: "d3", embedding: vec3, content: "doc three", metadata: { category: "a", score: 30 } },
    ]);
  });

  it("queries by cosine similarity", async () => {
    const results = await store.query({
      embedding: [1, 0, 0],
      topK: 2,
    });
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("d1"); // exact match
    expect(results[0].score).toBeCloseTo(1.0, 3);
  });

  it("applies minScore filter", async () => {
    const results = await store.query({
      embedding: [1, 0, 0],
      topK: 10,
      minScore: 0.999,
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("d1");
  });

  it("filters by metadata ($eq)", async () => {
    const results = await store.query({
      embedding: [1, 0, 0],
      topK: 10,
      filter: { category: "b" },
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("d2");
  });

  it("filters by metadata ($gt)", async () => {
    const results = await store.query({
      embedding: [1, 0, 0],
      topK: 10,
      filter: { score: { $gt: 15 } },
    });
    expect(results).toHaveLength(2);
  });

  it("filters with $and", async () => {
    const results = await store.query({
      embedding: [1, 0, 0],
      topK: 10,
      filter: { $and: [{ category: "a" }, { score: { $gte: 30 } }] },
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("d3");
  });

  it("filters with $or", async () => {
    const results = await store.query({
      embedding: [1, 0, 0],
      topK: 10,
      filter: { $or: [{ category: "b" }, { score: { $lte: 10 } }] },
    });
    expect(results).toHaveLength(2);
  });

  it("filters with $in", async () => {
    const results = await store.query({
      embedding: [1, 0, 0],
      topK: 10,
      filter: { category: { $in: ["a", "c"] } },
    });
    expect(results).toHaveLength(2);
  });

  it("deletes documents", async () => {
    await store.delete(["d1"]);
    const stats = await store.indexStats();
    expect(stats.totalDocuments).toBe(2);
  });

  it("upserts (updates existing)", async () => {
    await store.upsert([
      { id: "d1", embedding: vec2, content: "updated", metadata: {} },
    ]);
    const results = await store.query({
      embedding: vec2,
      topK: 1,
    });
    expect(results[0].content).toBe("updated");
  });

  it("returns index stats", async () => {
    const stats = await store.indexStats();
    expect(stats.totalDocuments).toBe(3);
    expect(stats.dimensions).toBe(3);
    expect(stats.indexType).toBe("brute-force");
  });
});

// =============================================================================
// Document Adapter
// =============================================================================

describe("MarkdownDocumentAdapter", () => {
  let adapter: MarkdownDocumentAdapter;

  beforeEach(() => {
    adapter = new MarkdownDocumentAdapter();
  });

  it("extracts raw text as a document", async () => {
    const docs = await adapter.extract("Hello world");
    expect(docs).toHaveLength(1);
    expect(docs[0].content).toBe("Hello world");
  });

  it("transforms: normalizes whitespace", async () => {
    const docs = await adapter.extract("a\r\n\n\n\nb");
    const transformed = await adapter.transform(docs);
    expect(transformed[0].content).toBe("a\n\nb");
  });

  it("chunks by paragraph", async () => {
    const text = Array(20)
      .fill("This is a paragraph of text.")
      .join("\n\n");
    const docs = await adapter.extract(text);
    const chunks = await adapter.chunk(docs, { chunkSize: 200, chunkOverlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].totalChunks).toBe(chunks.length);
  });

  it("preserves metadata through chunking", async () => {
    const docs = [
      { id: "doc1", content: "A\n\nB\n\nC", source: "test", metadata: { lang: "en" } },
    ];
    const chunks = await adapter.chunk(docs, { chunkSize: 2, chunkOverlap: 0 });
    expect(chunks.every((c) => c.metadata.lang === "en")).toBe(true);
    expect(chunks.every((c) => c.metadata.parentId === "doc1")).toBe(true);
  });
});

// =============================================================================
// Working Memory
// =============================================================================

describe("InMemoryWorkingMemory", () => {
  let mem: InMemoryWorkingMemory;

  beforeEach(() => {
    mem = new InMemoryWorkingMemory();
  });

  it("set/get round-trip", async () => {
    await mem.set("key1", { nested: true });
    expect(await mem.get("key1")).toEqual({ nested: true });
  });

  it("returns null for unknown key", async () => {
    expect(await mem.get("missing")).toBeNull();
  });

  it("TTL expiry", async () => {
    await mem.set("fast", "value", 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    expect(await mem.get("fast")).toBeNull();
  });

  it("delete removes entry", async () => {
    await mem.set("k", "v");
    expect(await mem.delete("k")).toBe(true);
    expect(await mem.get("k")).toBeNull();
  });

  it("list returns active entries", async () => {
    await mem.set("a", 1);
    await mem.set("b", 2);
    const entries = await mem.list();
    expect(entries).toHaveLength(2);
  });

  it("clear removes all", async () => {
    await mem.set("a", 1);
    await mem.set("b", 2);
    await mem.clear();
    expect(await mem.list()).toHaveLength(0);
  });

  it("stores deep copies (immutable)", async () => {
    const obj = { x: 1 };
    await mem.set("k", obj);
    obj.x = 999;
    expect(await mem.get("k")).toEqual({ x: 1 });
  });
});

// =============================================================================
// RAG Pipeline
// =============================================================================

describe("RAGPipeline", () => {
  let pipeline: RAGPipeline;
  let embeddingAdapter: InMemoryEmbeddingAdapter;

  beforeEach(() => {
    // Deterministic embeddings: hash text to vector
    embeddingAdapter = new InMemoryEmbeddingAdapter({
      dimensions: 8,
      embedFn: (text) => {
        const vec = new Array(8).fill(0);
        for (let i = 0; i < text.length; i++) {
          vec[i % 8] += text.charCodeAt(i);
        }
        const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
        return vec.map((v: number) => v / (norm || 1));
      },
    });

    pipeline = new RAGPipeline({
      documentPort: new MarkdownDocumentAdapter(),
      embeddingPort: embeddingAdapter,
      vectorStorePort: new InMemoryVectorStore(),
      chunkOptions: { chunkSize: 100, chunkOverlap: 20 },
      maxResults: 3,
    });
  });

  it("ingest: processes and stores documents", async () => {
    const result = await pipeline.ingest(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );
    expect(result.documentsProcessed).toBe(1);
    expect(result.chunksCreated).toBeGreaterThanOrEqual(1);
    expect(result.embeddingsGenerated).toBe(result.chunksCreated);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it("query: retrieves relevant chunks", async () => {
    await pipeline.ingest("TypeScript is great.\n\nPython is popular.\n\nRust is fast.");
    const result = await pipeline.query("TypeScript");
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.context).toContain("Source");
    expect(result.totalTokensUsed).toBeGreaterThan(0);
  });

  it("E2E: ingest multiple, query with filter", async () => {
    await pipeline.ingest("Machine learning models are powerful.");
    await pipeline.ingest("Database optimization techniques are essential.");

    const result = await pipeline.query("machine learning");
    expect(result.results.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Observational Memory Middleware
// =============================================================================

describe("createObservationalMemoryMiddleware", () => {
  it("triggers summarization at token threshold", async () => {
    const summarize = vi.fn().mockResolvedValue("Summary");
    const onSummarize = vi.fn();

    const mw = createObservationalMemoryMiddleware({
      thresholdFraction: 0.5,
      maxTokens: 100,
      summarize,
      onSummarize,
    });

    const ctx = { sessionId: "s1", timestamp: Date.now(), metadata: {} };

    // Generate text exceeding threshold (100 * 0.5 = 50 tokens = ~200 chars)
    const longText = "x".repeat(300);

    const result = await mw.afterAgent?.(ctx, {
      prompt: "test",
      result: { text: longText, steps: [], sessionId: "s1" },
    });

    expect(summarize).toHaveBeenCalled();
    expect(onSummarize).toHaveBeenCalled();
    expect(result).toEqual({ text: "Summary" });
  });

  it("does NOT summarize below threshold", async () => {
    const summarize = vi.fn();

    const mw = createObservationalMemoryMiddleware({
      thresholdFraction: 0.9,
      maxTokens: 100_000,
      summarize,
    });

    const ctx = { sessionId: "s1", timestamp: Date.now(), metadata: {} };

    const result = await mw.afterAgent?.(ctx, {
      prompt: "test",
      result: { text: "short", steps: [], sessionId: "s1" },
    });

    expect(summarize).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// Result Eviction Middleware
// =============================================================================

describe("createResultEvictionMiddleware", () => {
  it("evicts oversized tool results", async () => {
    const stored: Record<string, string> = {};
    const mw = createResultEvictionMiddleware({
      tokenThreshold: 10, // Very low for testing
      store: async (id, content) => { stored[id] = content; },
    });

    const ctx = { sessionId: "s1", timestamp: Date.now(), metadata: {} };

    const result = await mw.afterTool?.(ctx, {
      toolName: "search",
      args: {},
      result: "x".repeat(200), // Well over 10 tokens
      stepIndex: 0,
      durationMs: 100,
    });

    expect(result).toBeDefined();
    expect((result as { result: string }).result).toContain("evicted to storage");
    expect(Object.keys(stored)).toHaveLength(1);
  });

  it("skips excluded tools", async () => {
    const mw = createResultEvictionMiddleware({
      tokenThreshold: 1,
      excludeTools: ["ls"],
      store: async () => {},
    });

    const ctx = { sessionId: "s1", timestamp: Date.now(), metadata: {} };

    const result = await mw.afterTool?.(ctx, {
      toolName: "ls",
      args: {},
      result: "x".repeat(1000),
      stepIndex: 0,
      durationMs: 10,
    });

    expect(result).toBeUndefined();
  });

  it("passes through small results unchanged", async () => {
    const mw = createResultEvictionMiddleware({
      tokenThreshold: 50_000,
      store: async () => {},
    });

    const ctx = { sessionId: "s1", timestamp: Date.now(), metadata: {} };

    const result = await mw.afterTool?.(ctx, {
      toolName: "search",
      args: {},
      result: "small",
      stepIndex: 0,
      durationMs: 10,
    });

    expect(result).toBeUndefined();
  });
});
