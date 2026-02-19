import { describe, it, expect } from 'vitest';
import { TokenBudgetController } from '../token-budget-controller.js';

describe('TokenBudgetController', () => {
  it('acquire/release basic flow', () => {
    const ctrl = new TokenBudgetController(100_000, {
      estimatedTokensPerNode: 10_000,
    });

    const acq = ctrl.acquire('node-1');
    expect(acq.granted).toBe(true);
    expect(acq.delayMs).toBe(0);

    // remaining = 100k - 0 consumed - 10k reserved = 90k
    expect(ctrl.remaining()).toBe(90_000);

    ctrl.release({ input: 4_000, output: 3_000 });
    // consumed = 7k, reserved back to 0, remaining = 93k
    expect(ctrl.remaining()).toBe(93_000);
  });

  it('soft limit applies proportional delay', () => {
    // totalBudget=100k, softLimit=0.8 (80k), hardLimit=0.95 (95k)
    const ctrl = new TokenBudgetController(100_000, {
      estimatedTokensPerNode: 10_000,
    });

    // Consume 75k to approach soft limit
    for (let i = 0; i < 7; i++) {
      ctrl.acquire(`n${i}`);
      ctrl.release({ input: 5_000, output: 5_750 });
    }
    // consumed ≈ 75250, estimate updated via rolling avg

    // Next acquire should trigger soft limit (consumed + reserved + estimated > 80k)
    const acq = ctrl.acquire('soft-node');
    expect(acq.granted).toBe(true);
    expect(acq.delayMs).toBeGreaterThan(0);
  });

  it('hard limit rejects new acquisitions', () => {
    const ctrl = new TokenBudgetController(100_000, {
      estimatedTokensPerNode: 10_000,
    });

    // Consume 92k
    for (let i = 0; i < 9; i++) {
      ctrl.acquire(`n${i}`);
      ctrl.release({ input: 5_000, output: 5_222 });
    }

    // At this point consumed ≈ 92k, next acquire projected ≈ 92k + est > 95k
    const acq = ctrl.acquire('blocked-node');
    expect(acq.granted).toBe(false);
  });

  it('rolling estimate updates correctly', () => {
    const ctrl = new TokenBudgetController(1_000_000, {
      estimatedTokensPerNode: 10_000,
    });

    // Release a few nodes with actual usage of ~2k
    for (let i = 0; i < 5; i++) {
      ctrl.acquire(`n${i}`);
      ctrl.release({ input: 1_000, output: 1_000 });
    }

    // After 5 releases of 2k each, rolling estimate should be ≈ 2k
    // So remaining should be roughly 1M - 10k consumed - est*reserved
    // estimatedRemainingNodes should be large since estimate dropped
    expect(ctrl.estimatedRemainingNodes()).toBeGreaterThan(400);
  });

  it('remaining() reflects consumed + reserved', () => {
    const ctrl = new TokenBudgetController(50_000, {
      estimatedTokensPerNode: 5_000,
    });

    ctrl.acquire('a');
    expect(ctrl.remaining()).toBe(45_000);

    ctrl.acquire('b');
    expect(ctrl.remaining()).toBe(40_000);

    ctrl.release({ input: 2_000, output: 1_000 });
    // reserved -= 5000, consumed += 3000 → reserved=5000, consumed=3000
    expect(ctrl.remaining()).toBe(42_000);
  });

  it('check returns correct budget status', () => {
    const ctrl = new TokenBudgetController(100_000);

    expect(ctrl.check({ input: 10_000, output: 10_000 })).toBe('ok');
    expect(ctrl.check({ input: 40_000, output: 42_000 })).toBe('soft-limit');
    expect(ctrl.check({ input: 50_000, output: 46_000 })).toBe('hard-limit');
  });
});
