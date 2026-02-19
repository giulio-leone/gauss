// =============================================================================
// TokenBudgetController — Acquire/release budget with rolling estimation
// =============================================================================

export type BudgetStatus = 'ok' | 'soft-limit' | 'hard-limit';

export interface TokenBudgetControllerConfig {
  totalBudget: number;
  /** Fraction of budget triggering soft-limit (default 0.8) */
  softLimitRatio: number;
  /** Fraction of budget triggering hard-limit (default 0.95) */
  hardLimitRatio: number;
  /** Estimated tokens per node for pre-allocation (default 5000) */
  estimatedTokensPerNode: number;
}

const DEFAULT_BUDGET_CONFIG: Omit<TokenBudgetControllerConfig, 'totalBudget'> = {
  softLimitRatio: 0.8,
  hardLimitRatio: 0.95,
  estimatedTokensPerNode: 5_000,
};

export class TokenBudgetController {
  private readonly config: TokenBudgetControllerConfig;
  private reserved = 0;
  private consumed = 0;
  private readonly recentUsages: number[] = [];

  constructor(
    totalBudget: number,
    config?: Partial<Omit<TokenBudgetControllerConfig, 'totalBudget'>>,
  ) {
    this.config = { ...DEFAULT_BUDGET_CONFIG, totalBudget, ...config };
  }

  /**
   * Reserve budget BEFORE executing a node.
   * Returns whether it was granted and an optional throttle delay.
   */
  acquire(_nodeId: string): { granted: boolean; delayMs: number } {
    const estimated = this.config.estimatedTokensPerNode;
    const projected = this.consumed + this.reserved + estimated;
    const ratio = projected / this.config.totalBudget;

    if (ratio > this.config.hardLimitRatio) {
      return { granted: false, delayMs: 0 };
    }

    if (ratio > this.config.softLimitRatio) {
      const pressure =
        (ratio - this.config.softLimitRatio) /
        (this.config.hardLimitRatio - this.config.softLimitRatio);
      const delayMs = Math.round(pressure * 5_000);
      this.reserved += estimated;
      return { granted: true, delayMs };
    }

    this.reserved += estimated;
    return { granted: true, delayMs: 0 };
  }

  /**
   * Finalize actual consumption. Moves tokens from reserved to consumed.
   */
  release(actual: { input: number; output: number }): void {
    this.reserved = Math.max(
      0,
      this.reserved - this.config.estimatedTokensPerNode,
    );
    this.consumed += actual.input + actual.output;
    this.updateEstimate(actual.input + actual.output);
  }

  /** Check current budget status without reserving */
  check(usage: { input: number; output: number }): BudgetStatus {
    const total = usage.input + usage.output;
    const ratio = total / this.config.totalBudget;
    if (ratio >= this.config.hardLimitRatio) return 'hard-limit';
    if (ratio >= this.config.softLimitRatio) return 'soft-limit';
    return 'ok';
  }

  /** Remaining budget (total - consumed - reserved) */
  remaining(): number {
    return Math.max(
      0,
      this.config.totalBudget - this.consumed - this.reserved,
    );
  }

  /** Estimated number of nodes that can still execute */
  estimatedRemainingNodes(): number {
    return Math.floor(this.remaining() / this.config.estimatedTokensPerNode);
  }

  /** Rolling average of last N executions to refine estimates */
  private updateEstimate(actual: number): void {
    this.recentUsages.push(actual);
    if (this.recentUsages.length > 20) this.recentUsages.shift();
    this.config.estimatedTokensPerNode = Math.ceil(
      this.recentUsages.reduce((a, b) => a + b, 0) / this.recentUsages.length,
    );
  }
}
