// =============================================================================
// gauss — Clean Public API Surface
// =============================================================================
//
// Usage:
//   import { agent, graph, rag } from 'gauss'
//
//   const a = agent({ model, instructions: 'You are helpful.' })
//     .withMemory(memory)
//     .build()
//
//   const result = await a.run('Hello')
//
// =============================================================================

import type { LanguageModel } from "ai";
import type { AgentConfig } from "./types.js";
import type { GraphConfig } from "./domain/graph.schema.js";
import { AgentBuilder } from "./agent/agent-builder.js";
import { AgentGraph } from "./graph/agent-graph.js";
import { RAGPipeline } from "./rag/pipeline.js";
import type { RAGPipelineConfig } from "./rag/pipeline.js";

// =============================================================================
// agent() — Create an agent via builder pattern
// =============================================================================

/**
 * Create a new agent builder with the given configuration.
 *
 * @example
 * ```ts
 * const myAgent = agent({
 *   model: openai('gpt-4o'),
 *   instructions: 'You are a helpful assistant.',
 * })
 *   .withPlanning()
 *   .withMemory(memory)
 *   .build()
 *
 * const result = await myAgent.run('Hello!')
 * ```
 */
export function agent(config: AgentConfig): AgentBuilder {
  return new AgentBuilder(config);
}

// =============================================================================
// graph() — Create a multi-agent graph
// =============================================================================

/**
 * Create a new agent graph builder.
 *
 * @example
 * ```ts
 * const pipeline = graph()
 *   .node('extract', { model, instructions: 'Extract entities.' })
 *   .node('classify', { model, instructions: 'Classify entities.' })
 *   .edge('extract', 'classify')
 *   .build()
 *
 * const result = await pipeline.run('Analyze this document...')
 * ```
 */
export function graph(config?: Partial<GraphConfig>) {
  return AgentGraph.create(config);
}

// =============================================================================
// rag() — Create a RAG pipeline
// =============================================================================

/**
 * Create a new RAG (Retrieval-Augmented Generation) pipeline.
 *
 * @example
 * ```ts
 * const pipeline = rag({
 *   documentPort: new MarkdownDocumentAdapter(),
 *   embeddingPort: new InMemoryEmbeddingAdapter(),
 *   vectorStorePort: new InMemoryVectorStore(),
 * })
 *
 * await pipeline.ingest('path/to/docs')
 * const result = await pipeline.query('How does authentication work?')
 * ```
 */
export function rag(config: RAGPipelineConfig): RAGPipeline {
  return new RAGPipeline(config);
}

// =============================================================================
// team() — Create a team of coordinated agents
// =============================================================================

export { team } from "./graph/team-builder.js";
export type { CoordinationStrategy, TeamResult } from "./graph/team-builder.js";

// =============================================================================
// workflow() — Create a workflow via fluent DSL
// =============================================================================

export { workflow } from "./domain/workflow-dsl.js";
export type { StepDefinition, BranchDefinition } from "./domain/workflow-dsl.js";

// =============================================================================
// multimodal() — Create a multimodal (text + image) agent
// =============================================================================

export { multimodal } from "./domain/multimodal.js";
export type { ImageInput, MultimodalMessage, MultimodalResult } from "./domain/multimodal.js";
