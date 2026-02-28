// =============================================================================
// gauss — Clean Public API Surface
// =============================================================================
//
// Zero-config quickstart:
//   import gauss from 'gauss'
//   const answer = await gauss('Explain quantum computing')
//
// Power user:
//   import { agent, graph, rag, memory, team, workflow } from 'gauss'
//
// =============================================================================

import type { LanguageModel } from "./core/llm/index.js";
import type { AgentConfig } from "./types.js";
import type { GraphConfig } from "./domain/graph.schema.js";
import { AgentBuilder } from "./agent/agent-builder.js";
import { AgentGraph } from "./graph/agent-graph.js";
import { RAGPipeline } from "./rag/pipeline.js";
import type { RAGPipelineConfig } from "./rag/pipeline.js";
import type { MemoryPluginOptions } from "./plugins/memory.plugin.js";
import { createMemoryPlugin } from "./plugins/memory.plugin.js";

// =============================================================================
// Smart model detection from environment
// =============================================================================

interface QuickOptions {
  model?: string | LanguageModel;
  instructions?: string;
  temperature?: number;
}

const ENV_PROVIDER_MAP: Array<{ env: string; pkg: string; factory: string; defaultModel: string }> = [
  { env: "OPENAI_API_KEY", pkg: "@ai-sdk/openai", factory: "createOpenAI", defaultModel: "gpt-5.2" },
  { env: "ANTHROPIC_API_KEY", pkg: "@ai-sdk/anthropic", factory: "createAnthropic", defaultModel: "claude-sonnet-4-20250514" },
  { env: "GOOGLE_GENERATIVE_AI_API_KEY", pkg: "@ai-sdk/google", factory: "createGoogleGenerativeAI", defaultModel: "gemini-2.5-flash-preview-05-20" },
  { env: "GROQ_API_KEY", pkg: "@ai-sdk/groq", factory: "createGroq", defaultModel: "llama-3.3-70b-versatile" },
  { env: "MISTRAL_API_KEY", pkg: "@ai-sdk/mistral", factory: "createMistral", defaultModel: "mistral-large-latest" },
];

async function detectModel(): Promise<LanguageModel> {
  for (const { env, pkg, factory, defaultModel } of ENV_PROVIDER_MAP) {
    if (process.env[env]) {
      try {
        const mod = await import(pkg);
        const create = mod[factory] ?? mod.default;
        if (typeof create === "function") {
          return create()(defaultModel) as LanguageModel;
        }
      } catch {
        // Package not installed, try next
      }
    }
  }
  throw new GaussError(
    "No AI provider detected",
    "Set one of these environment variables: " +
      ENV_PROVIDER_MAP.map((p) => p.env).join(", ") +
      "\n\nOr provide a model explicitly:\n" +
      "  import { openai } from 'gauss/providers'\n" +
      "  const answer = await gauss('Hello', { model: openai('gpt-5.2') })"
  );
}

// =============================================================================
// GaussError — Actionable error messages
// =============================================================================

export class GaussError extends Error {
  readonly suggestion: string;

  constructor(message: string, suggestion: string) {
    super(`${message}\n\n💡 ${suggestion}`);
    this.name = "GaussError";
    this.suggestion = suggestion;
  }
}

// =============================================================================
// gauss() — Zero-config one-liner
// =============================================================================

/**
 * The simplest way to use Gauss. Auto-detects model from environment.
 *
 * @example
 * ```ts
 * // One-liner (auto-detects OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
 * const answer = await gauss('Explain quantum computing')
 *
 * // With options
 * const answer = await gauss('Translate to Italian', {
 *   model: 'gpt-5.2',
 *   instructions: 'You are a translator.',
 *   temperature: 0.3,
 * })
 * ```
 */
async function gauss(prompt: string, options?: QuickOptions): Promise<string> {
  let model: LanguageModel;

  if (options?.model) {
    if (typeof options.model === "string") {
      // String shorthand: "gpt-5.2" → use detected provider
      model = await detectModel();
    } else {
      model = options.model;
    }
  } else {
    model = await detectModel();
  }

  const { generateText } = await import("./core/llm/index.js");
  const result = await (generateText as any)({
    model,
    prompt,
    system: options?.instructions,
    temperature: options?.temperature,
  });

  return result.text;
}

// Attach named exports as properties for `import gauss from 'gauss'` usage
gauss.agent = agent;
gauss.graph = graph;
gauss.rag = rag;
gauss.memory = memory;

export default gauss;

// =============================================================================
// agent() — Create an agent via builder pattern
// =============================================================================

/**
 * Create a new agent builder with the given configuration.
 *
 * @example
 * ```ts
 * const myAgent = agent({
 *   model: openai('gpt-5.2'),
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
// memory() — Create a memory plugin for agents
// =============================================================================

/**
 * Create a memory plugin that gives agents persistent recall capabilities.
 *
 * @example
 * ```ts
 * // Simple in-memory (default)
 * const mem = memory()
 *
 * // With custom adapter
 * const mem = memory({ adapter: myRedisAdapter, autoStore: true })
 *
 * // Attach to agent
 * const myAgent = agent({ model, instructions: '...' })
 *   .withPlugin(mem)
 *   .build()
 * ```
 */
export function memory(options?: MemoryPluginOptions) {
  return createMemoryPlugin(options);
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

// =============================================================================
// videoProcessor() — Create a video analysis pipeline
// =============================================================================

export { videoProcessor } from "./domain/video-processor.js";
export type { VideoInput, VideoFrame, VideoAnalysisResult } from "./domain/video-processor.js";
