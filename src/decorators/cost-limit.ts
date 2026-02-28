// =============================================================================
// Cost Limit Decorator — Budget enforcement for agent runs
// =============================================================================

import type { Decorator, RunContext, AgentResult } from "../core/agent/types.js";

export interface CostLimitConfig {
  maxUsd: number;
  onBudgetExceeded?: "abort" | "warn";
  /** Cost per 1M input tokens in USD (default: $3.00 — GPT-4o class) */
  inputCostPer1M?: number;
  /** Cost per 1M output tokens in USD (default: $15.00 — GPT-4o class) */
  outputCostPer1M?: number;
}

export function costLimit(config: CostLimitConfig): Decorator {
  const { maxUsd, onBudgetExceeded = "abort" } = config;
  const inputCostPer1M = config.inputCostPer1M ?? 3.0;
  const outputCostPer1M = config.outputCostPer1M ?? 15.0;

  let cumulativeCost = 0;

  return {
    name: "cost-limit",

    async afterRun(ctx: RunContext, result: AgentResult) {
      const inputCost = (result.usage.inputTokens / 1_000_000) * inputCostPer1M;
      const outputCost = (result.usage.outputTokens / 1_000_000) * outputCostPer1M;
      const runCost = inputCost + outputCost;
      cumulativeCost += runCost;

      result.cost = {
        totalUsd: runCost,
        inputTokensCost: inputCost,
        outputTokensCost: outputCost,
      };

      if (cumulativeCost > maxUsd) {
        if (onBudgetExceeded === "abort") {
          throw new Error(
            `Budget exceeded: $${cumulativeCost.toFixed(4)} > $${maxUsd.toFixed(2)} limit`,
          );
        }
        // "warn" mode — attach warning but return result
        ctx.metadata["_costWarning"] = `Budget warning: $${cumulativeCost.toFixed(4)} of $${maxUsd.toFixed(2)}`;
      }

      return result;
    },
  };
}
