// =============================================================================
// InMemoryEmbeddingAdapter — Mock embedding for testing (random vectors)
// =============================================================================

import type { EmbeddingPort, EmbeddingResult } from "../../ports/embedding.port.js";

export class InMemoryEmbeddingAdapter implements EmbeddingPort {
  readonly dimensions: number;
  readonly modelId: string;
  private readonly embedFn: (text: string) => number[];

  constructor(options?: {
    dimensions?: number;
    modelId?: string;
    embedFn?: (text: string) => number[];
  }) {
    this.dimensions = options?.dimensions ?? 384;
    this.modelId = options?.modelId ?? "inmemory-mock";
    this.embedFn = options?.embedFn ?? (() => this.randomVector());
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const embedding = this.embedFn(text);
    return { embedding, tokenCount: Math.ceil(text.length / 4) };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private randomVector(): number[] {
    const vec = new Array(this.dimensions);
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      vec[i] = Math.random() * 2 - 1;
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < this.dimensions; i++) {
      vec[i] /= norm;
    }
    return vec;
  }
}
