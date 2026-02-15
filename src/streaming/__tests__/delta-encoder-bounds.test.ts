import { describe, it, expect } from "vitest";
import { createDeltaEncoder } from "../delta-encoder.js";
import type { AgentEvent } from "../../types.js";

function makeEvent(type: string, data?: unknown): AgentEvent {
  return { type: type as any, timestamp: Date.now(), sessionId: "s1", data };
}

describe("DeltaEncoder — maxEntries", () => {
  it("evicts oldest entry when maxEntries is reached", () => {
    const encoder = createDeltaEncoder({ maxEntries: 2 });

    // Insert 2 entries
    encoder.encode(makeEvent("type-a", { v: 1 }));
    encoder.encode(makeEvent("type-b", { v: 2 }));

    // Insert 3rd, should evict type-a
    encoder.encode(makeEvent("type-c", { v: 3 }));

    // type-a should be treated as new (full serialized output, not null)
    const result = encoder.encode(makeEvent("type-a", { v: 1 }));
    expect(result).not.toBeNull();
  });

  it("does not evict when updating existing key", () => {
    const encoder = createDeltaEncoder({ maxEntries: 2 });

    encoder.encode(makeEvent("type-a", { v: 1 }));
    encoder.encode(makeEvent("type-b", { v: 2 }));

    // Update existing key — should NOT evict
    const result = encoder.encode(makeEvent("type-a", { v: 99 }));
    expect(result).not.toBeNull();

    // type-b should still be tracked (returns null for same data)
    const dup = encoder.encode(makeEvent("type-b", { v: 2 }));
    expect(dup).toBeNull();
  });

  it("defaults to 1000 maxEntries", () => {
    const encoder = createDeltaEncoder();
    for (let i = 0; i < 1000; i++) {
      encoder.encode(makeEvent(`type-${i}`, { i }));
    }
    // 1001st should evict oldest
    encoder.encode(makeEvent("type-new", { v: "new" }));

    // type-0 was evicted — encoding it again should return full output
    const result = encoder.encode(makeEvent("type-0", { i: 0 }));
    expect(result).not.toBeNull();
  });
});
