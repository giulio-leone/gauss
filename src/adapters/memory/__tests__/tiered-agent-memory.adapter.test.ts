import { describe, expect, it } from "vitest";

import { InMemoryAgentMemoryAdapter } from "../in-memory-agent-memory.adapter.js";
import { TieredAgentMemoryAdapter } from "../tiered-agent-memory.adapter.js";
import type { MemoryEntry } from "../../../ports/agent-memory.port.js";

function entry(overrides: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    content: "content",
    type: "fact",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("TieredAgentMemoryAdapter", () => {
  it("routes store operations to tier by type/tier", async () => {
    const short = new InMemoryAgentMemoryAdapter();
    const working = new InMemoryAgentMemoryAdapter();
    const semantic = new InMemoryAgentMemoryAdapter();
    const observation = new InMemoryAgentMemoryAdapter();

    const adapter = new TieredAgentMemoryAdapter({
      shortTerm: short,
      working,
      semantic,
      observation,
    });

    await adapter.store(entry({ type: "fact", content: "semantic-fact" }));
    await adapter.store(entry({ type: "task", content: "working-task" }));
    await adapter.store(
      entry({ type: "summary", tier: "observation", content: "observation" }),
    );

    expect((await semantic.recall("", { limit: 10 })).map((e) => e.content)).toContain(
      "semantic-fact",
    );
    expect((await working.recall("", { limit: 10 })).map((e) => e.content)).toContain(
      "working-task",
    );
    expect(
      (await observation.recall("", { limit: 10 })).map((e) => e.content),
    ).toContain("observation");
  });

  it("supports tier-filtered recall", async () => {
    const adapter = new TieredAgentMemoryAdapter();

    await adapter.store(entry({ type: "fact", tier: "semantic", content: "A" }));
    await adapter.store(
      entry({ type: "summary", tier: "observation", content: "B" }),
    );

    const semantic = await adapter.recall("", { tier: "semantic", limit: 10 });

    expect(semantic).toHaveLength(1);
    expect(semantic[0]?.content).toBe("A");
    expect(semantic[0]?.tier).toBe("semantic");
  });

  it("merges multi-tier recall by recency", async () => {
    const adapter = new TieredAgentMemoryAdapter();

    await adapter.store(
      entry({
        type: "summary",
        tier: "observation",
        content: "old-observation",
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    );
    await adapter.store(
      entry({
        type: "task",
        tier: "working",
        content: "new-working",
        timestamp: "2024-12-01T00:00:00.000Z",
      }),
    );

    const results = await adapter.recall("", {
      includeTiers: ["working", "observation"],
      limit: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.content).toBe("new-working");
    expect(results[1]?.content).toBe("old-observation");
  });

  it("reports aggregate stats with byTier", async () => {
    const adapter = new TieredAgentMemoryAdapter();

    await adapter.store(entry({ type: "fact", tier: "semantic", content: "f1" }));
    await adapter.store(entry({ type: "fact", tier: "semantic", content: "f2" }));
    await adapter.store(entry({ type: "task", tier: "working", content: "t1" }));

    const stats = await adapter.getStats();
    expect(stats.totalEntries).toBe(3);
    expect(stats.byType).toMatchObject({ fact: 2, task: 1 });
    expect(stats.byTier).toMatchObject({ semantic: 2, working: 1 });
  });
});
