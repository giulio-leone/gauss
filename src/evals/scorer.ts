// =============================================================================
// Scorer Pipeline — Multi-step scoring with LLM judge support
// =============================================================================

export interface ScoreResult {
  score: number;      // 0-1
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface ScorerStep<TInput = unknown> {
  name: string;
  execute(input: TInput, context: ScorerContext): Promise<TInput>;
}

export interface ScorerContext {
  /** LLM judge function: returns 0-1 score for a question about the content */
  judge?: (prompt: string, content: string) => Promise<number>;
  metadata: Record<string, unknown>;
}

export interface Scorer {
  name: string;
  score(input: string, expected?: string, context?: ScorerContext): Promise<ScoreResult>;
}

// --- Scorer Factory ---

export function createScorer(opts: {
  name: string;
  score: (input: string, expected?: string, context?: ScorerContext) => Promise<ScoreResult>;
}): Scorer {
  return { name: opts.name, score: opts.score };
}

// --- Scorer Pipeline ---

export class ScorerPipeline {
  private steps: ScorerStep[] = [];
  private scorers: Scorer[] = [];

  addStep(step: ScorerStep): this {
    this.steps.push(step);
    return this;
  }

  addScorer(scorer: Scorer): this {
    this.scorers.push(scorer);
    return this;
  }

  async run(input: string, expected?: string, context?: Partial<ScorerContext>): Promise<Record<string, ScoreResult>> {
    const ctx: ScorerContext = { judge: context?.judge, metadata: context?.metadata ?? {} };

    // Run preprocessing steps
    let processed: unknown = input;
    for (const step of this.steps) {
      processed = await step.execute(processed, ctx);
    }
    const processedStr = typeof processed === "string" ? processed : JSON.stringify(processed);

    // Run all scorers in parallel
    const entries = await Promise.all(
      this.scorers.map(async (scorer) => {
        const result = await scorer.score(processedStr, expected, ctx);
        return [scorer.name, result] as const;
      }),
    );

    return Object.fromEntries(entries);
  }
}

// --- Built-in Scorers ---

/** Exact match scorer */
export const exactMatchScorer = createScorer({
  name: "exact_match",
  async score(input, expected) {
    if (!expected) return { score: 0, reason: "No expected value provided" };
    return input === expected
      ? { score: 1, reason: "Exact match" }
      : { score: 0, reason: "Does not match expected value" };
  },
});

/** Contains scorer — checks if output contains expected substring */
export const containsScorer = createScorer({
  name: "contains",
  async score(input, expected) {
    if (!expected) return { score: 0, reason: "No expected value provided" };
    return input.includes(expected)
      ? { score: 1, reason: "Contains expected value" }
      : { score: 0, reason: "Does not contain expected value" };
  },
});

/** Length scorer — penalizes overly short or long outputs */
export const lengthScorer = createScorer({
  name: "length",
  async score(input, _expected, context) {
    const minLen = (context?.metadata?.minLength as number) ?? 10;
    const maxLen = (context?.metadata?.maxLength as number) ?? 5000;
    const len = input.length;
    if (len < minLen) return { score: len / minLen, reason: `Too short (${len}/${minLen})` };
    if (len > maxLen) return { score: maxLen / len, reason: `Too long (${len}/${maxLen})` };
    return { score: 1, reason: "Length within bounds" };
  },
});

/** LLM Judge scorer — uses context.judge to evaluate */
export const llmJudgeScorer = createScorer({
  name: "llm_judge",
  async score(input, expected, context) {
    if (!context?.judge) return { score: 0, reason: "No LLM judge provided" };
    const prompt = expected
      ? `Rate how well this response answers the expected output.\nExpected: ${expected}\nActual: ${input}`
      : `Rate the quality of this response: ${input}`;
    const score = await context.judge(prompt, input);
    return { score, reason: `LLM judge score: ${score}` };
  },
});
