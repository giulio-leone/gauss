// =============================================================================
// InMemorySuspensionAdapter — Memory-backed suspension store with TTL
// =============================================================================

import type {
  SuspensionPort,
  SuspendedState,
  ResumeDecision,
  SuspensionReason,
} from "../../ports/suspension.port.js";

export class InMemorySuspensionAdapter implements SuspensionPort {
  private readonly store = new Map<string, SuspendedState>();

  async suspend(state: SuspendedState): Promise<void> {
    this.store.set(state.id, structuredClone(state));
  }

  async resume(suspensionId: string, decision: ResumeDecision): Promise<SuspendedState> {
    const stored = this.store.get(suspensionId);
    if (!stored) {
      throw new Error(`Suspension "${suspensionId}" not found`);
    }

    // Work on a deep copy to preserve store immutability
    const state: SuspendedState = structuredClone(stored);

    // Apply decisions to pending tool calls
    if (decision.toolDecisions) {
      state.pendingToolCalls = state.pendingToolCalls.map((tc) => {
        const d = decision.toolDecisions?.[tc.toolCallId];
        if (!d) return tc;
        if (d.action === "edit" && d.args !== undefined) {
          return { ...tc, args: d.args };
        }
        return tc;
      });
    }

    // Merge metadata
    if (decision.metadata) {
      Object.assign(state.metadata, decision.metadata);
    }

    // Inject input as a message
    if (decision.input) {
      state.messages.push({ role: "user", content: decision.input });
    }

    this.store.delete(suspensionId);
    return state;
  }

  async get(suspensionId: string): Promise<SuspendedState | null> {
    const state = this.store.get(suspensionId);
    if (!state) return null;
    if (state.expiresAt > 0 && Date.now() > state.expiresAt) {
      this.store.delete(suspensionId);
      return null;
    }
    return structuredClone(state);
  }

  async list(options?: {
    sessionId?: string;
    reason?: SuspensionReason;
    limit?: number;
    offset?: number;
  }): Promise<SuspendedState[]> {
    const now = Date.now();
    let results = Array.from(this.store.values()).filter((s) => {
      if (s.expiresAt > 0 && now > s.expiresAt) return false;
      if (options?.sessionId && s.sessionId !== options.sessionId) return false;
      if (options?.reason && s.reason !== options.reason) return false;
      return true;
    });

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? results.length;
    results = results.slice(offset, offset + limit);

    return results.map((s) => structuredClone(s));
  }

  async cancel(suspensionId: string): Promise<boolean> {
    return this.store.delete(suspensionId);
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, state] of this.store) {
      if (state.expiresAt > 0 && now > state.expiresAt) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }
}
