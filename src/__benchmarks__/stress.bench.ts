// =============================================================================
// Stress benchmarks for core GaussFlow modules
// =============================================================================

import { describe, bench, beforeAll } from "vitest";

import { MiddlewareChain } from "../middleware/chain.js";
import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeAgentParams,
} from "../ports/middleware.port.js";
import { InMemoryVectorStore } from "../adapters/vector-store/inmemory.adapter.js";
import {
  ScorerPipeline,
  createScorer,
  exactMatchScorer,
  containsScorer,
  lengthScorer,
} from "../evals/scorer.js";
import { RAGPipeline } from "../rag/pipeline.js";
import type { DocumentPort, Document } from "../ports/document.port.js";
import type { EmbeddingPort, EmbeddingResult } from "../ports/embedding.port.js";
import { AgentNetworkAdapter } from "../adapters/agent-network/agent-network.adapter.js";

// =============================================================================
// Helpers
// =============================================================================

function randomVector(dim: number): number[] {
  const v = new Array<number>(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random() * 2 - 1;
  return v;
}

const MIDDLEWARE_CTX: MiddlewareContext = {
  sessionId: "bench-session",
  agentName: "bench-agent",
  timestamp: Date.now(),
  metadata: {},
};

const BEFORE_AGENT_PARAMS: BeforeAgentParams = {
  prompt: "hello world",
  instructions: "be helpful",
  tools: {},
};

// =============================================================================
// 1. Middleware chain throughput
// =============================================================================

describe("Middleware chain throughput", () => {
  let chain: MiddlewareChain;

  beforeAll(() => {
    chain = new MiddlewareChain();
    for (let i = 0; i < 10; i++) {
      const mw: MiddlewarePort = {
        name: `mw-${i}`,
        priority: i * 100,
        async beforeAgent(_ctx, params) {
          return { prompt: params.prompt + "." };
        },
      };
      chain.use(mw);
    }
  });

  bench("runBeforeAgent × 1 000", async () => {
    for (let i = 0; i < 1_000; i++) {
      await chain.runBeforeAgent(MIDDLEWARE_CTX, BEFORE_AGENT_PARAMS);
    }
  });
});

// =============================================================================
// 2. Vector store query performance
// =============================================================================

describe("Vector store query performance", () => {
  const DIM = 128;
  const N = 1_000;
  let store: InMemoryVectorStore;
  let queryVec: number[];

  beforeAll(async () => {
    store = new InMemoryVectorStore();
    const docs = Array.from({ length: N }, (_, i) => ({
      id: `doc-${i}`,
      embedding: randomVector(DIM),
      content: `document ${i}`,
      metadata: { idx: i },
    }));
    await store.upsert(docs);
    queryVec = randomVector(DIM);
  });

  bench("query top-10 over 1 000 vectors (dim 128)", async () => {
    await store.query({ embedding: queryVec, topK: 10 });
  });
});

// =============================================================================
// 3. Scorer pipeline throughput
// =============================================================================

describe("Scorer pipeline throughput", () => {
  let pipeline: ScorerPipeline;

  beforeAll(() => {
    pipeline = new ScorerPipeline();
    pipeline.addScorer(exactMatchScorer);
    pipeline.addScorer(containsScorer);
    pipeline.addScorer(lengthScorer);
  });

  bench("score 100 items × 3 scorers", async () => {
    for (let i = 0; i < 100; i++) {
      await pipeline.run(`output item ${i}`, `expected item ${i}`);
    }
  });
});

// =============================================================================
// 4. RAG pipeline ingest + query
// =============================================================================

describe("RAG pipeline ingest + query", () => {
  const DIM = 64;

  const mockDocumentPort: DocumentPort = {
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

  const mockEmbeddingPort: EmbeddingPort = {
    dimensions: DIM,
    modelId: "mock-embed",
    async embed(_text: string): Promise<EmbeddingResult> {
      return { embedding: randomVector(DIM), tokenCount: 4 };
    },
    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
      return texts.map(() => ({ embedding: randomVector(DIM), tokenCount: 4 }));
    },
  };

  let rag: RAGPipeline;

  beforeAll(() => {
    rag = new RAGPipeline({
      documentPort: mockDocumentPort,
      embeddingPort: mockEmbeddingPort,
      vectorStorePort: new InMemoryVectorStore(),
    });
  });

  bench("ingest 50 docs then query", async () => {
    for (let i = 0; i < 50; i++) {
      await rag.ingest(`document-${i}`);
    }
    await rag.query("find something relevant");
  });
});

// =============================================================================
// 5. Agent network delegation
// =============================================================================

describe("Agent network delegation", () => {
  let network: AgentNetworkAdapter;

  beforeAll(() => {
    network = new AgentNetworkAdapter({
      topology: "mesh",
      handler: async (req) => `result-for-${req.to}`,
    });

    for (let i = 0; i < 5; i++) {
      network.register({
        name: `agent-${i}`,
        capabilities: ["general"],
      });
    }
  });

  bench("delegate 100 tasks across 5 agents", async () => {
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        network.delegate({
          from: `agent-${i % 5}`,
          to: `agent-${(i + 1) % 5}`,
          task: `task-${i}`,
        }),
      );
    }
    await Promise.all(promises);
  });
});
