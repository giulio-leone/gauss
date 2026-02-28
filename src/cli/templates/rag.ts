// =============================================================================
// Template: RAG Agent — Retrieval-Augmented Generation
// =============================================================================
// gauss init --template rag
//
// Agent that retrieves context from a vector store before answering.
// =============================================================================

import { agent, rag, InMemoryVectorStore } from "gauss";
import { openai } from "gauss/providers";

// 1. Set up vector store
const vectorStore = new InMemoryVectorStore();

// 2. Create RAG pipeline
const ragPipeline = rag({
  vectorStore,
  topK: 5,
  minScore: 0.7,
});

// 3. Ingest documents
await ragPipeline.ingest([
  {
    id: "doc-1",
    content: "Gauss is an AI agent framework built on Vercel AI SDK with hexagonal architecture.",
    metadata: { source: "docs" },
  },
  {
    id: "doc-2",
    content: "Gauss supports multiple providers: OpenAI, Anthropic, Google, Groq, and Ollama.",
    metadata: { source: "docs" },
  },
  {
    id: "doc-3",
    content: "The plugin system supports middleware, lifecycle hooks, and tool injection.",
    metadata: { source: "docs" },
  },
]);

// 4. Create RAG-powered agent
const ragAgent = agent({
  model: openai("gpt-5.2"),
  instructions: `You are a documentation assistant.
Answer questions using ONLY the provided context.
If the context doesn't contain the answer, say so.`,
  rag: ragPipeline,
}).build();

// 5. Query
const result = await ragAgent.run("What providers does Gauss support?");
console.log(result.text);
