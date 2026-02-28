// =============================================================================
// LlmJudgeConsensus — LLM-based consensus using a judge model
// =============================================================================

import { generateText } from "../../core/llm/index.js";
import type { LanguageModel } from "../../core/llm/index.js";
import type {
  ConsensusPort,
  ConsensusResult,
} from "../../ports/consensus.port.js";

export interface LlmJudgeOptions {
  model: LanguageModel;
  criteria?: string;
}

const DEFAULT_CRITERIA =
  "quality, completeness, correctness, and clarity";

export class LlmJudgeConsensus implements ConsensusPort {
  constructor(private readonly options: LlmJudgeOptions) {}

  async evaluate(
    results: Array<{ id: string; output: string }>,
  ): Promise<ConsensusResult> {
    if (results.length === 0) {
      throw new Error("No results to evaluate");
    }
    if (results.length === 1) {
      return {
        winnerId: results[0].id,
        winnerOutput: results[0].output,
        scores: { [results[0].id]: 10 },
      };
    }

    const criteria = this.options.criteria ?? DEFAULT_CRITERIA;

    const prompt = [
      "You are a judge evaluating multiple results. Evaluate each result based on: " + criteria + ".",
      "",
      "Results:",
      ...results.map(
        (r, i) => `--- Result ${i + 1} (id: ${r.id}) ---\n${r.output}\n`,
      ),
      "",
      "Respond ONLY with a JSON object (no markdown fences) with this structure:",
      JSON.stringify({
        scores: { "<id>": "<number 1-10>" },
        winnerId: "<id of best result>",
        merged: "<if top scores are within 1 point, merge the best parts into a single output; otherwise null>",
        reasoning: "<brief explanation>",
      }),
    ].join("\n");

    try {
      const { text } = await generateText({
        model: this.options.model,
        prompt,
      });

      const cleaned = text
        .replace(/```(?:json)?\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      const parsed = JSON.parse(cleaned) as {
        scores?: Record<string, number>;
        winnerId?: string;
        merged?: string | null;
        reasoning?: string;
      };

      const scores: Record<string, number> = {};
      if (parsed.scores) {
        for (const [k, v] of Object.entries(parsed.scores)) {
          scores[k] = Number(v);
        }
      }

      const winnerId =
        parsed.winnerId && results.some((r) => r.id === parsed.winnerId)
          ? parsed.winnerId
          : results[0].id;

      const winner = results.find((r) => r.id === winnerId)!;

      return {
        winnerId,
        winnerOutput: winner.output,
        scores,
        merged: parsed.merged ?? undefined,
        reasoning: parsed.reasoning ?? undefined,
      };
    } catch {
      // Fallback to first result on any error
      return {
        winnerId: results[0].id,
        winnerOutput: results[0].output,
        reasoning: "LLM judge evaluation failed; falling back to first result",
      };
    }
  }
}
