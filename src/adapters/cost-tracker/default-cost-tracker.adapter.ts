// =============================================================================
// DefaultCostTrackerAdapter — In-memory cost tracking with model pricing
// =============================================================================

import type { CostTrackerPort, CostTokenUsage, CostEstimate } from "../../ports/cost-tracker.port.js";

// Pricing per 1M tokens: [input, output]
const MODEL_PRICING: Record<string, [number, number]> = {
  // OpenAI
  "gpt-5.2":                    [2.50, 10.00],
  "gpt-5.2-mini":               [0.15, 0.60],
  "gpt-4-turbo":               [10.00, 30.00],
  // Anthropic
  "claude-sonnet-4-20250514":  [3.00, 15.00],
  "claude-3-haiku":            [0.25, 1.25],
  "claude-opus-4-20250514":    [15.00, 75.00],
  // Google
  "gemini-2.5-flash-preview-05-20":          [0.10, 0.40],
  "gemini-1.5-pro":            [1.25, 5.00],
  // Groq
  "llama-3.1-70b":             [0.59, 0.79],
  // Mistral
  "mistral-large":             [2.00, 6.00],
};

export interface CostTrackerOptions {
  budget?: number;
  onBudgetExceeded?: () => void;
  /** When true, suppresses console.warn for unknown models (useful for replaying records). */
  silent?: boolean;
}

export class DefaultCostTrackerAdapter implements CostTrackerPort {
  private readonly usages: CostTokenUsage[] = [];
  private readonly budget: number | null;
  private readonly onBudgetExceeded?: () => void;
  private readonly silent: boolean;
  private budgetExceededFired = false;
  private totalCost = 0;

  /** Models seen that have no pricing data. */
  readonly unpricedModels = new Set<string>();

  constructor(options: CostTrackerOptions = {}) {
    this.budget = options.budget ?? null;
    this.onBudgetExceeded = options.onBudgetExceeded;
    this.silent = options.silent ?? false;
  }

  recordUsage(usage: CostTokenUsage): void {
    // Validate: clamp non-finite / negative token counts to 0
    const inputTokens = Number.isFinite(usage.inputTokens) && usage.inputTokens > 0 ? usage.inputTokens : 0;
    const outputTokens = Number.isFinite(usage.outputTokens) && usage.outputTokens > 0 ? usage.outputTokens : 0;
    const sanitized: CostTokenUsage = { ...usage, inputTokens, outputTokens };

    this.usages.push(sanitized);

    // Warn and track unpriced models
    if (!MODEL_PRICING[sanitized.model]) {
      if (!this.unpricedModels.has(sanitized.model)) {
        if (!this.silent) {
          console.warn(`[CostTracker] Unknown model "${sanitized.model}" — cost will be recorded as $0`);
        }
        this.unpricedModels.add(sanitized.model);
      }
    }

    // Maintain running total for O(1) budget check
    this.totalCost += this.calculateCost(sanitized.model, inputTokens, outputTokens);

    if (this.onBudgetExceeded && !this.budgetExceededFired && this.isOverBudget()) {
      this.budgetExceededFired = true;
      this.onBudgetExceeded();
    }
  }

  getEstimate(): CostEstimate {
    const byModel = new Map<string, { inputTokens: number; outputTokens: number }>();

    for (const u of this.usages) {
      const existing = byModel.get(u.model) ?? { inputTokens: 0, outputTokens: 0 };
      existing.inputTokens += u.inputTokens;
      existing.outputTokens += u.outputTokens;
      byModel.set(u.model, existing);
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const breakdown: CostEstimate["breakdown"] = [];

    for (const [model, tokens] of byModel) {
      const cost = this.calculateCost(model, tokens.inputTokens, tokens.outputTokens);
      totalInputTokens += tokens.inputTokens;
      totalOutputTokens += tokens.outputTokens;
      breakdown.push({ model, inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, cost });
    }

    const totalCost = breakdown.reduce((sum, b) => sum + b.cost, 0);
    return { totalInputTokens, totalOutputTokens, totalCost, currency: "USD", breakdown };
  }

  getSessionBudget(): number | null {
    return this.budget;
  }

  isOverBudget(): boolean {
    if (this.budget === null) return false;
    return this.totalCost > this.budget;
  }

  reset(): void {
    this.usages.length = 0;
    this.totalCost = 0;
    this.unpricedModels.clear();
    this.budgetExceededFired = false;
  }

  exportUsage(): string {
    return JSON.stringify(this.usages);
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0;
    const [inputPer1M, outputPer1M] = pricing;
    return (inputTokens / 1_000_000) * inputPer1M + (outputTokens / 1_000_000) * outputPer1M;
  }
}
