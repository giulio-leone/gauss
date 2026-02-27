// =============================================================================
// Tests: Suspension Port + InMemory Adapter
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySuspensionAdapter } from "../../../adapters/suspension/inmemory.adapter.js";
import type { SuspendedState } from "../../../ports/suspension.port.js";

function makeState(overrides?: Partial<SuspendedState>): SuspendedState {
  return {
    id: `susp-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "sess-1",
    reason: "awaiting_approval",
    messages: [{ role: "user", content: "hello" }],
    pendingToolCalls: [
      { toolCallId: "tc1", toolName: "search", args: { q: "test" } },
    ],
    metadata: {},
    version: 1,
    suspendedAt: Date.now(),
    expiresAt: 0,
    ...overrides,
  };
}

describe("InMemorySuspensionAdapter", () => {
  let adapter: InMemorySuspensionAdapter;

  beforeEach(() => {
    adapter = new InMemorySuspensionAdapter();
  });

  // -- suspend / get --
  it("stores and retrieves a suspended state", async () => {
    const state = makeState();
    await adapter.suspend(state);

    const retrieved = await adapter.get(state.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(state.id);
    expect(retrieved!.reason).toBe("awaiting_approval");
  });

  it("returns null for unknown suspension", async () => {
    expect(await adapter.get("unknown")).toBeNull();
  });

  // -- resume --
  it("resumes a suspension with input injection", async () => {
    const state = makeState();
    await adapter.suspend(state);

    const resumed = await adapter.resume(state.id, {
      input: "proceed",
    });

    expect(resumed.messages).toHaveLength(2);
    expect(resumed.messages[1]).toEqual({
      role: "user",
      content: "proceed",
    });

    // Should be removed from store
    expect(await adapter.get(state.id)).toBeNull();
  });

  it("resumes with edited tool args", async () => {
    const state = makeState();
    await adapter.suspend(state);

    const resumed = await adapter.resume(state.id, {
      toolDecisions: {
        tc1: { action: "edit", args: { q: "modified" } },
      },
    });

    expect(resumed.pendingToolCalls[0].args).toEqual({ q: "modified" });
  });

  it("throws on resuming unknown suspension", async () => {
    await expect(
      adapter.resume("unknown", {}),
    ).rejects.toThrow('Suspension "unknown" not found');
  });

  // -- list --
  it("lists suspensions filtered by sessionId", async () => {
    await adapter.suspend(makeState({ sessionId: "a" }));
    await adapter.suspend(makeState({ sessionId: "b" }));
    await adapter.suspend(makeState({ sessionId: "a" }));

    const results = await adapter.list({ sessionId: "a" });
    expect(results).toHaveLength(2);
    expect(results.every((s) => s.sessionId === "a")).toBe(true);
  });

  it("lists suspensions filtered by reason", async () => {
    await adapter.suspend(makeState({ reason: "awaiting_approval" }));
    await adapter.suspend(makeState({ reason: "awaiting_input" }));

    const results = await adapter.list({ reason: "awaiting_input" });
    expect(results).toHaveLength(1);
    expect(results[0].reason).toBe("awaiting_input");
  });

  it("respects limit and offset", async () => {
    for (let i = 0; i < 5; i++) {
      await adapter.suspend(makeState({ sessionId: "x" }));
    }

    const page = await adapter.list({ limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
  });

  // -- cancel --
  it("cancels a suspension", async () => {
    const state = makeState();
    await adapter.suspend(state);
    expect(await adapter.cancel(state.id)).toBe(true);
    expect(await adapter.get(state.id)).toBeNull();
  });

  it("returns false when cancelling unknown suspension", async () => {
    expect(await adapter.cancel("unknown")).toBe(false);
  });

  // -- TTL / cleanup --
  it("auto-expires on get when expiresAt is past", async () => {
    const state = makeState({ expiresAt: Date.now() - 1000 });
    await adapter.suspend(state);
    expect(await adapter.get(state.id)).toBeNull();
  });

  it("excludes expired from list", async () => {
    await adapter.suspend(makeState({ expiresAt: Date.now() - 1000 }));
    await adapter.suspend(makeState({ expiresAt: 0 })); // no expiry
    const results = await adapter.list();
    expect(results).toHaveLength(1);
  });

  it("cleanup removes expired entries", async () => {
    await adapter.suspend(makeState({ expiresAt: Date.now() - 1000 }));
    await adapter.suspend(makeState({ expiresAt: Date.now() - 2000 }));
    await adapter.suspend(makeState({ expiresAt: 0 }));

    const removed = await adapter.cleanup();
    expect(removed).toBe(2);
    expect((await adapter.list())).toHaveLength(1);
  });

  // -- immutability --
  it("returns copies (not references) of state", async () => {
    const state = makeState();
    await adapter.suspend(state);

    const a = await adapter.get(state.id);
    const b = await adapter.get(state.id);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
