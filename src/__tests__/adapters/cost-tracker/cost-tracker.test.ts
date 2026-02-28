import { describe, it, expect, vi } from "vitest";
import { DefaultCostTrackerAdapter } from "../../../adapters/cost-tracker/default-cost-tracker.adapter.js";
import type { CostTokenUsage } from "../../../ports/cost-tracker.port.js";

function usage(model: string, inputTokens: number, outputTokens: number, provider = "openai"): CostTokenUsage {
  return { model, inputTokens, outputTokens, provider, timestamp: Date.now() };
}

describe("DefaultCostTrackerAdapter", () => {
  it("records usage and returns correct estimate", () => {
    const tracker = new DefaultCostTrackerAdapter();
    tracker.recordUsage(usage("gpt-5.2", 1_000_000, 1_000_000));

    const est = tracker.getEstimate();
    expect(est.totalInputTokens).toBe(1_000_000);
    expect(est.totalOutputTokens).toBe(1_000_000);
    // gpt-5.2: $2.50/1M input + $10/1M output = $12.50
    expect(est.totalCost).toBeCloseTo(12.5);
    expect(est.currency).toBe("USD");
    expect(est.breakdown).toHaveLength(1);
    expect(est.breakdown[0].model).toBe("gpt-5.2");
  });

  it("handles multiple models in breakdown", () => {
    const tracker = new DefaultCostTrackerAdapter();
    tracker.recordUsage(usage("gpt-5.2", 500_000, 500_000));
    tracker.recordUsage(usage("claude-sonnet-4-20250514", 200_000, 100_000, "anthropic"));

    const est = tracker.getEstimate();
    expect(est.breakdown).toHaveLength(2);
    expect(est.totalInputTokens).toBe(700_000);
    expect(est.totalOutputTokens).toBe(600_000);

    const gptBreakdown = est.breakdown.find(b => b.model === "gpt-5.2")!;
    // 500k input = $1.25, 500k output = $5 → $6.25
    expect(gptBreakdown.cost).toBeCloseTo(6.25);

    const claudeBreakdown = est.breakdown.find(b => b.model === "claude-sonnet-4-20250514")!;
    // 200k input = $0.60, 100k output = $1.50 → $2.10
    expect(claudeBreakdown.cost).toBeCloseTo(2.10);
  });

  it("aggregates multiple usages for the same model", () => {
    const tracker = new DefaultCostTrackerAdapter();
    tracker.recordUsage(usage("gpt-5.2-mini", 100_000, 50_000));
    tracker.recordUsage(usage("gpt-5.2-mini", 200_000, 100_000));

    const est = tracker.getEstimate();
    expect(est.breakdown).toHaveLength(1);
    expect(est.breakdown[0].inputTokens).toBe(300_000);
    expect(est.breakdown[0].outputTokens).toBe(150_000);
  });

  it("tracks unknown models as unpriced and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tracker = new DefaultCostTrackerAdapter();
    tracker.recordUsage(usage("unknown-model", 1_000_000, 1_000_000));

    const est = tracker.getEstimate();
    expect(est.totalCost).toBe(0);
    expect(est.totalInputTokens).toBe(1_000_000);
    expect(tracker.unpricedModels.has("unknown-model")).toBe(true);
    expect(warnSpy).toHaveBeenCalledOnce();

    // Second call with same model should not warn again
    tracker.recordUsage(usage("unknown-model", 100, 100));
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("enforces budget — isOverBudget", () => {
    const tracker = new DefaultCostTrackerAdapter({ budget: 1.0 });
    expect(tracker.isOverBudget()).toBe(false);
    expect(tracker.getSessionBudget()).toBe(1.0);

    // gpt-5.2: 1M input = $2.50, already over $1 budget
    tracker.recordUsage(usage("gpt-5.2", 1_000_000, 0));
    expect(tracker.isOverBudget()).toBe(true);
  });

  it("returns false for isOverBudget when no budget is set", () => {
    const tracker = new DefaultCostTrackerAdapter();
    tracker.recordUsage(usage("gpt-5.2", 10_000_000, 10_000_000));
    expect(tracker.isOverBudget()).toBe(false);
    expect(tracker.getSessionBudget()).toBeNull();
  });

  it("fires onBudgetExceeded callback once", () => {
    const callback = vi.fn();
    const tracker = new DefaultCostTrackerAdapter({ budget: 0.01, onBudgetExceeded: callback });

    tracker.recordUsage(usage("gpt-5.2", 1_000_000, 0));
    expect(callback).toHaveBeenCalledTimes(1);

    // Recording more usage should not fire again
    tracker.recordUsage(usage("gpt-5.2", 1_000_000, 0));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("resets all state including totalCost and unpricedModels", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callback = vi.fn();
    const tracker = new DefaultCostTrackerAdapter({ budget: 0.01, onBudgetExceeded: callback });

    tracker.recordUsage(usage("gpt-5.2", 1_000_000, 1_000_000));
    tracker.recordUsage(usage("mystery-model", 100, 100));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(tracker.unpricedModels.size).toBe(1);

    tracker.reset();
    const est = tracker.getEstimate();
    expect(est.totalInputTokens).toBe(0);
    expect(est.totalOutputTokens).toBe(0);
    expect(est.totalCost).toBe(0);
    expect(est.breakdown).toHaveLength(0);
    expect(tracker.isOverBudget()).toBe(false);
    expect(tracker.unpricedModels.size).toBe(0);

    // Callback should fire again after reset
    tracker.recordUsage(usage("gpt-5.2", 1_000_000, 0));
    expect(callback).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it("exports usage as JSON", () => {
    const tracker = new DefaultCostTrackerAdapter();
    const u = usage("gpt-5.2", 100, 200);
    tracker.recordUsage(u);

    const exported = JSON.parse(tracker.exportUsage());
    expect(exported).toHaveLength(1);
    expect(exported[0].model).toBe("gpt-5.2");
    expect(exported[0].inputTokens).toBe(100);
    expect(exported[0].outputTokens).toBe(200);
  });

  it("always uses USD currency", () => {
    const tracker = new DefaultCostTrackerAdapter();
    tracker.recordUsage(usage("gpt-5.2", 1000, 1000));
    expect(tracker.getEstimate().currency).toBe("USD");
  });

  it("clamps negative token counts to 0", () => {
    const tracker = new DefaultCostTrackerAdapter();
    tracker.recordUsage(usage("gpt-5.2", -500, -1000));

    const est = tracker.getEstimate();
    expect(est.totalInputTokens).toBe(0);
    expect(est.totalOutputTokens).toBe(0);
    expect(est.totalCost).toBe(0);
  });

  it("clamps NaN and Infinity token counts to 0", () => {
    const tracker = new DefaultCostTrackerAdapter();
    tracker.recordUsage(usage("gpt-5.2", NaN, Infinity));

    const est = tracker.getEstimate();
    expect(est.totalInputTokens).toBe(0);
    expect(est.totalOutputTokens).toBe(0);
  });

  it("calculates correct costs for all supported models", () => {
    const cases: Array<[string, number, number, number]> = [
      // [model, inputTokens, outputTokens, expectedCost]
      ["gpt-5.2",                   1_000_000, 1_000_000, 12.50],
      ["gpt-5.2-mini",              1_000_000, 1_000_000, 0.75],
      ["gpt-4-turbo",              1_000_000, 1_000_000, 40.00],
      ["claude-sonnet-4-20250514", 1_000_000, 1_000_000, 18.00],
      ["claude-3-haiku",           1_000_000, 1_000_000, 1.50],
      ["claude-opus-4-20250514",   1_000_000, 1_000_000, 90.00],
      ["gemini-2.5-flash-preview-05-20",         1_000_000, 1_000_000, 0.50],
      ["gemini-1.5-pro",           1_000_000, 1_000_000, 6.25],
      ["llama-3.1-70b",            1_000_000, 1_000_000, 1.38],
      ["mistral-large",            1_000_000, 1_000_000, 8.00],
    ];

    for (const [model, input, output, expected] of cases) {
      const tracker = new DefaultCostTrackerAdapter();
      tracker.recordUsage(usage(model, input, output));
      expect(tracker.getEstimate().totalCost).toBeCloseTo(expected, 2);
    }
  });

  describe("builder integration", () => {
    it("withCostTracker is available on AgentBuilder", async () => {
      // Verify the builder method exists by importing and checking
      const { AgentBuilder } = await import("../../../agent/agent-builder.js");
      const tracker = new DefaultCostTrackerAdapter();

      // Create a mock model to satisfy the builder
      const mockModel = { modelId: "test" } as any;
      const builder = new AgentBuilder({
        model: mockModel,
        instructions: "test",
      });

      // withCostTracker should return the builder for chaining
      const result = builder.withCostTracker(tracker);
      expect(result).toBe(builder);
    });
  });
});
