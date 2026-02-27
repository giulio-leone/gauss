// =============================================================================
// InMemoryVectorStore — Brute-force cosine similarity vector search
// =============================================================================

import type {
  VectorStorePort,
  VectorDocument,
  VectorSearchParams,
  VectorSearchResult,
  VectorIndexStats,
  VectorFilter,
} from "../../ports/vector-store.port.js";

export class InMemoryVectorStore implements VectorStorePort {
  private readonly store = new Map<string, VectorDocument>();

  async upsert(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.store.set(doc.id, safeClone(doc));
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const doc of this.store.values()) {
      if (params.filter && !matchesFilter(doc.metadata, params.filter)) {
        continue;
      }

      const score = cosineSimilarity(params.embedding, doc.embedding);
      if (params.minScore !== undefined && score < params.minScore) continue;

      results.push({
        id: doc.id,
        content: doc.content,
        metadata: { ...doc.metadata },
        score,
        embedding: params.includeEmbeddings ? [...doc.embedding] : undefined,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, params.topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.store.delete(id);
    }
  }

  async indexStats(): Promise<VectorIndexStats> {
    let dims = 0;
    for (const doc of this.store.values()) {
      dims = doc.embedding.length;
      break;
    }
    return {
      totalDocuments: this.store.size,
      dimensions: dims,
      indexType: "brute-force",
    };
  }
}

// =============================================================================
// Cosine similarity
// =============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// =============================================================================
// Metadata filter evaluation (MongoDB-style subset)
// =============================================================================

function matchesFilter(
  metadata: Record<string, unknown>,
  filter: VectorFilter,
): boolean {
  if ("$and" in filter) {
    return (filter.$and as VectorFilter[]).every((f) => matchesFilter(metadata, f));
  }
  if ("$or" in filter) {
    return (filter.$or as VectorFilter[]).some((f) => matchesFilter(metadata, f));
  }
  if ("$not" in filter) {
    return !matchesFilter(metadata, filter.$not as VectorFilter);
  }

  // Field-level comparison
  for (const [key, condition] of Object.entries(filter)) {
    const val = metadata[key];

    if (condition === null || condition === undefined || typeof condition !== "object") {
      // Direct equality
      if (val !== condition) return false;
      continue;
    }

    const cond = condition as Record<string, unknown>;

    if ("$eq" in cond && val !== cond.$eq) return false;
    if ("$ne" in cond && val === cond.$ne) return false;
    if ("$gt" in cond && !(typeof val === "number" && val > (cond.$gt as number))) return false;
    if ("$gte" in cond && !(typeof val === "number" && val >= (cond.$gte as number))) return false;
    if ("$lt" in cond && !(typeof val === "number" && val < (cond.$lt as number))) return false;
    if ("$lte" in cond && !(typeof val === "number" && val <= (cond.$lte as number))) return false;
    if ("$in" in cond && !(cond.$in as unknown[]).includes(val)) return false;
    if ("$nin" in cond && (cond.$nin as unknown[]).includes(val)) return false;
  }

  return true;
}

function safeClone<T>(value: T): T {
  try {
    // JSON roundtrip guarantees serializability downstream
    return JSON.parse(JSON.stringify(value));
  } catch {
    // Fallback for types JSON can't handle (Date, Map, etc.)
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  }
}
