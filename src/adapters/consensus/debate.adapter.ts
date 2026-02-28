// =============================================================================
// DebateConsensus — Multi-round debate until convergence
// =============================================================================

import { generateText } from "../../core/llm/index.js";
import type { LanguageModel } from "../../core/llm/index.js";
import type {
  ConsensusPort,
  ConsensusResult,
} from "../../ports/consensus.port.js";

export interface DebateOptions {
  model: LanguageModel;
  maxRounds?: number;
}

const DEFAULT_MAX_ROUNDS = 3;

export class DebateConsensus implements ConsensusPort {
  constructor(private readonly options: DebateOptions) {}

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
      };
    }

    const maxRounds = this.options.maxRounds ?? DEFAULT_MAX_ROUNDS;
    let previousSynthesis = "";

    try {
      for (let round = 0; round < maxRounds; round++) {
        const prompt = [
          `Debate round ${round + 1}/${maxRounds}.`,
          "Review the following results, critique them, and produce an improved synthesis that combines the best aspects of all results.",
          "",
          "Results:",
          ...results.map(
            (r, i) => `--- Result ${i + 1} (id: ${r.id}) ---\n${r.output}\n`,
          ),
          ...(previousSynthesis
            ? [
                "Previous synthesis:",
                previousSynthesis,
                "",
                "Improve upon the previous synthesis if possible. If it is already optimal, repeat it exactly.",
              ]
            : []),
          "",
          "Respond with ONLY the improved synthesis text, nothing else.",
        ].join("\n");

        const { text } = await generateText({
          model: this.options.model,
          prompt,
        });

        const synthesis = text.trim();

        if (synthesis === previousSynthesis) {
          break; // converged
        }

        previousSynthesis = synthesis;
      }
    } catch {
      // On error, fall back to first result if no synthesis yet
      if (!previousSynthesis) {
        return {
          winnerId: results[0].id,
          winnerOutput: results[0].output,
          reasoning: "Debate failed; falling back to first result",
        };
      }
    }

    return {
      winnerId: "debate-synthesis",
      winnerOutput: previousSynthesis,
      merged: previousSynthesis,
      reasoning: `Produced via multi-round debate (up to ${maxRounds} rounds)`,
    };
  }
}
