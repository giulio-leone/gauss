// =============================================================================
// DefaultReRankingAdapter — Implements TF-IDF, BM25, MMR re-ranking
// =============================================================================

import type { ReRankingPort, ReRankingOptions, ScoredResult } from "../../ports/reranking.port.js";

// BM25 parameters
const K1 = 1.2;
const B = 0.75;

/** Module-level compiled regex for punctuation removal. */
const PUNCTUATION_RE = /[^\w\s]/g;

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(PUNCTUATION_RE, "").split(/\s+/).filter(Boolean);
}

/**
 * Build a term-frequency map from a token list in a single O(n) pass.
 * Each value is the raw count of that term in the token list.
 */
function buildTermFrequencyMap(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return freq;
}

function computeTfIdf(query: string, results: ScoredResult[]): ScoredResult[] {
  const queryTokens = tokenize(query);
  const docTokenSets = results.map((r) => tokenize(r.text));
  const docFreqMaps = docTokenSets.map(buildTermFrequencyMap);
  const n = results.length;

  // Compute IDF for each query term
  const idf = new Map<string, number>();
  for (const term of queryTokens) {
    let df = 0;
    for (const fm of docFreqMaps) {
      if (fm.has(term)) df++;
    }
    idf.set(term, Math.log((n + 1) / (df + 1)) + 1);
  }

  return results.map((r, i) => {
    const tokens = docTokenSets[i]!;
    const freqMap = docFreqMaps[i]!;
    let score = 0;
    for (const term of queryTokens) {
      const tf = (freqMap.get(term) ?? 0) / (tokens.length || 1);
      score += tf * (idf.get(term) ?? 0);
    }
    return { ...r, score };
  }).sort((a, b) => b.score - a.score);
}

function computeBm25(query: string, results: ScoredResult[]): ScoredResult[] {
  const queryTokens = tokenize(query);
  const docTokenSets = results.map((r) => tokenize(r.text));
  const docFreqMaps = docTokenSets.map(buildTermFrequencyMap);
  const n = results.length;
  const avgDl = docTokenSets.reduce((sum, t) => sum + t.length, 0) / (n || 1) || 1;

  // IDF
  const idf = new Map<string, number>();
  for (const term of queryTokens) {
    let df = 0;
    for (const fm of docFreqMaps) {
      if (fm.has(term)) df++;
    }
    idf.set(term, Math.log((n - df + 0.5) / (df + 0.5) + 1));
  }

  return results.map((r, i) => {
    const tokens = docTokenSets[i]!;
    const freqMap = docFreqMaps[i]!;
    const dl = tokens.length;
    let score = 0;
    for (const term of queryTokens) {
      const tf = freqMap.get(term) ?? 0;
      const idfVal = idf.get(term) ?? 0;
      score += idfVal * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (dl / avgDl))));
    }
    return { ...r, score };
  }).sort((a, b) => b.score - a.score);
}

/** A TF vector with a pre-computed L2 norm for fast cosine similarity. */
interface TfVector {
  vec: Map<string, number>;
  norm: number;
}

/**
 * Compute cosine similarity between two pre-normed TF vectors.
 * Iterates the smaller vector and looks up in the larger one — O(min(|a|,|b|)).
 */
function cosineSimilarity(a: TfVector, b: TfVector): number {
  const denom = a.norm * b.norm;
  if (denom === 0) return 0;

  // Iterate the smaller map, lookup in the larger
  const [small, large] = a.vec.size <= b.vec.size ? [a.vec, b.vec] : [b.vec, a.vec];
  let dot = 0;
  for (const [k, v] of small) {
    const other = large.get(k);
    if (other !== undefined) dot += v * other;
  }
  return dot / denom;
}

/**
 * Build a normalized TF vector with pre-computed L2 norm from tokens.
 */
function toTfVector(tokens: string[]): TfVector {
  const freqMap = buildTermFrequencyMap(tokens);
  const len = tokens.length;
  // Normalize counts to frequencies and compute norm in one pass
  let normSq = 0;
  for (const [k, v] of freqMap) {
    const tf = v / len;
    freqMap.set(k, tf);
    normSq += tf * tf;
  }
  return { vec: freqMap, norm: Math.sqrt(normSq) };
}

function computeMmr(query: string, results: ScoredResult[], lambda: number): ScoredResult[] {
  if (results.length === 0) return [];

  const queryVec = toTfVector(tokenize(query));
  const docVecs = results.map((r) => toTfVector(tokenize(r.text)));

  // Pre-compute relevance scores (cosine similarity to query)
  const relevances = docVecs.map((dv) => cosineSimilarity(queryVec, dv));

  // Pre-compute pairwise similarities and cache them
  const pairwiseSim = new Map<string, number>();
  const pairKey = (i: number, j: number): string => i < j ? `${i},${j}` : `${j},${i}`;

  const selected: number[] = [];
  const remaining = new Set(results.map((_, i) => i));
  const reranked: ScoredResult[] = [];

  while (remaining.size > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (const idx of remaining) {
      const rel = relevances[idx]!;
      let maxSim = 0;
      for (const selIdx of selected) {
        const key = pairKey(idx, selIdx);
        let sim = pairwiseSim.get(key);
        if (sim === undefined) {
          sim = cosineSimilarity(docVecs[idx]!, docVecs[selIdx]!);
          pairwiseSim.set(key, sim);
        }
        if (sim > maxSim) maxSim = sim;
      }
      const mmrScore = lambda * rel - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      selected.push(bestIdx);
      remaining.delete(bestIdx);
      reranked.push({ ...results[bestIdx]!, score: bestScore });
    }
  }

  return reranked;
}

export class DefaultReRankingAdapter implements ReRankingPort {
  rerank(query: string, results: ScoredResult[], options?: ReRankingOptions): ScoredResult[] {
    if (results.length === 0) return [];

    const strategy = options?.strategy ?? "bm25";

    switch (strategy) {
      case "tfidf":
        return computeTfIdf(query, results);
      case "bm25":
        return computeBm25(query, results);
      case "mmr":
        return computeMmr(query, results, options?.lambda ?? 0.7);
      default:
        return computeBm25(query, results);
    }
  }
}
