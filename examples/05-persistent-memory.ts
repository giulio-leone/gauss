// =============================================================================
// 05 — Persistent Memory + VectorStore for RAG context
// =============================================================================
//
// Demonstrates the in-memory conversation store (Memory) and the vector store
// (VectorStore) for similarity-based retrieval. Both are backed by Rust core.
//
// Usage: npx tsx examples/05-persistent-memory.ts

import { Agent, Memory, VectorStore } from "gauss-ts";

async function main(): Promise<void> {
  // ── Memory: conversation store ─────────────────────────────────────
  const memory = new Memory();

  // Store conversation entries
  await memory.store({
    id: "m1",
    content: "The user prefers TypeScript over JavaScript.",
    entryType: "preference",
    timestamp: new Date().toISOString(),
    importance: 0.9,
  });

  await memory.store({
    id: "m2",
    content: "Previous conversation: user asked about Rust FFI bindings.",
    entryType: "conversation",
    timestamp: new Date().toISOString(),
    sessionId: "session-001",
  });

  // Recall all entries (optionally filtered by session)
  const entries = await memory.recall({ limit: 10 });
  console.log("Memory entries:", entries.length);

  const stats = await memory.stats();
  console.log("Memory stats:", stats);

  // ── VectorStore: similarity search ─────────────────────────────────
  const store = new VectorStore();

  // Upsert chunks with embeddings (in real use, generate embeddings via an API)
  await store.upsert([
    { id: "c1", documentId: "doc1", content: "Gauss uses Rust NAPI bindings", index: 0, embedding: [0.1, 0.9, 0.3] },
    { id: "c2", documentId: "doc1", content: "Agents support tool execution", index: 1, embedding: [0.2, 0.8, 0.4] },
    { id: "c3", documentId: "doc2", content: "Teams coordinate multiple agents", index: 0, embedding: [0.7, 0.1, 0.6] },
  ]);

  // Search by embedding similarity
  const results = await store.search([0.15, 0.85, 0.35], 2);
  console.log("Vector search results:");
  for (const r of results) {
    console.log(`  [${r.score.toFixed(3)}] ${r.text}`);
  }

  // Cosine similarity helper
  const sim = VectorStore.cosineSimilarity([1, 0, 0], [0, 1, 0]);
  console.log("Cosine similarity [1,0,0] vs [0,1,0]:", sim);

  // ── Agent with context from memory ─────────────────────────────────
  const context = entries.map((e) => e.content).join("\n");
  const agent = new Agent({
    name: "context-agent",
    instructions: `Use this context:\n${context}`,
  });

  const result = await agent.run("Based on my preferences, suggest a project idea.");
  console.log("Agent response:", result.text);

  // ── Cleanup ────────────────────────────────────────────────────────
  agent.destroy();
  memory.destroy();
  store.destroy();
}

main().catch(console.error);
