// =============================================================================
// CostTrackerPort — Cost and token usage tracking contract
// =============================================================================

export interface CostTokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  timestamp: number;
}

export interface CostEstimate {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  currency: "USD";
  breakdown: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
}

export interface CostTrackerPort {
  recordUsage(usage: CostTokenUsage): void;
  getEstimate(): CostEstimate;
  getSessionBudget(): number | null;
  isOverBudget(): boolean;
  reset(): void;
  exportUsage(): string;
}
