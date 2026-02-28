// =============================================================================
// DebugSessionImpl — Navigable, branchable recording of an agent run
// =============================================================================

import type {
  DebugSession,
  DebugCheckpoint,
  DebugState,
  BreakpointCondition,
  BreakpointHit,
  DebugDiff,
} from "../../ports/agent-debugger.port.js";

interface StoredBreakpoint {
  id: string;
  condition: BreakpointCondition;
}

let nextBpId = 0;

export class DebugSessionImpl implements DebugSession {
  readonly id: string;
  readonly agentId: string;
  readonly prompt: string;
  readonly checkpoints: DebugCheckpoint[] = [];

  private cursor = -1;
  private breakpoints: StoredBreakpoint[] = [];

  constructor(id: string, agentId: string, prompt: string) {
    this.id = id;
    this.agentId = agentId;
    this.prompt = prompt;
  }

  // ---------------------------------------------------------------------------
  // Checkpoint recording
  // ---------------------------------------------------------------------------

  addCheckpoint(
    type: DebugCheckpoint["type"],
    data: Record<string, unknown>,
    state: DebugState,
  ): DebugCheckpoint {
    const cp: DebugCheckpoint = {
      index: this.checkpoints.length,
      timestamp: Date.now(),
      type,
      data,
      state: { ...state },
    };
    this.checkpoints.push(cp);
    this.cursor = cp.index;
    return cp;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  goto(index: number): DebugCheckpoint {
    if (index < 0 || index >= this.checkpoints.length) {
      throw new RangeError(
        `Checkpoint index ${index} out of range [0, ${this.checkpoints.length - 1}]`,
      );
    }
    this.cursor = index;
    return this.checkpoints[index];
  }

  stepForward(): DebugCheckpoint | null {
    if (this.cursor + 1 >= this.checkpoints.length) return null;
    this.cursor++;
    return this.checkpoints[this.cursor];
  }

  stepBackward(): DebugCheckpoint | null {
    if (this.cursor <= 0) return null;
    this.cursor--;
    return this.checkpoints[this.cursor];
  }

  currentIndex(): number {
    return this.cursor;
  }

  // ---------------------------------------------------------------------------
  // Branching
  // ---------------------------------------------------------------------------

  branch(modifications: Partial<DebugCheckpoint>): DebugSession {
    const branched = new DebugSessionImpl(
      `${this.id}-branch-${Date.now()}`,
      this.agentId,
      this.prompt,
    );

    // Clone checkpoints up to and including the current cursor
    const sliced = this.checkpoints.slice(0, this.cursor + 1);
    for (const cp of sliced) {
      branched.checkpoints.push({ ...cp, state: { ...cp.state } });
    }

    // Apply modifications to the last checkpoint
    if (branched.checkpoints.length > 0) {
      const last = branched.checkpoints[branched.checkpoints.length - 1];
      if (modifications.data) last.data = { ...last.data, ...modifications.data };
      if (modifications.state) last.state = { ...last.state, ...modifications.state };
      if (modifications.type) last.type = modifications.type;
    }

    branched.cursor = branched.checkpoints.length - 1;
    return branched;
  }

  // ---------------------------------------------------------------------------
  // Breakpoints
  // ---------------------------------------------------------------------------

  addBreakpoint(condition: BreakpointCondition): string {
    const id = `bp-${++nextBpId}`;
    this.breakpoints.push({ id, condition });
    return id;
  }

  removeBreakpoint(id: string): void {
    this.breakpoints = this.breakpoints.filter((bp) => bp.id !== id);
  }

  checkBreakpoints(checkpoint: DebugCheckpoint): BreakpointHit | null {
    for (const bp of this.breakpoints) {
      if (this.matchesCondition(bp.condition, checkpoint)) {
        return { breakpointId: bp.id, condition: bp.condition, checkpoint };
      }
    }
    return null;
  }

  private matchesCondition(
    cond: BreakpointCondition,
    cp: DebugCheckpoint,
  ): boolean {
    switch (cond.type) {
      case "tool_call":
        return (
          cp.type === "tool_call" &&
          (cond.toolName == null || cp.data["toolName"] === cond.toolName)
        );
      case "token_threshold":
        return (
          cond.threshold != null && cp.state.tokenCount >= cond.threshold
        );
      case "cost_threshold":
        return (
          cond.threshold != null && cp.state.costEstimate >= cond.threshold
        );
      case "step_count":
        return cond.threshold != null && cp.index >= cond.threshold;
      case "custom":
        return cond.predicate ? cond.predicate(cp) : false;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Diff
  // ---------------------------------------------------------------------------

  diff(other: DebugSession | DebugCheckpoint[]): DebugDiff[] {
    const otherCps = Array.isArray(other) ? other : other.checkpoints;
    const diffs: DebugDiff[] = [];
    const maxLen = Math.max(this.checkpoints.length, otherCps.length);

    for (let i = 0; i < maxLen; i++) {
      const left = this.checkpoints[i];
      const right = otherCps[i];

      if (!left && right) {
        diffs.push({
          checkpointIndex: i,
          field: "checkpoint",
          left: undefined,
          right: right.type,
          type: "added",
        });
        continue;
      }
      if (left && !right) {
        diffs.push({
          checkpointIndex: i,
          field: "checkpoint",
          left: left.type,
          right: undefined,
          type: "removed",
        });
        continue;
      }
      if (left && right) {
        if (left.type !== right.type) {
          diffs.push({
            checkpointIndex: i,
            field: "type",
            left: left.type,
            right: right.type,
            type: "changed",
          });
        }
        if (JSON.stringify(left.data) !== JSON.stringify(right.data)) {
          diffs.push({
            checkpointIndex: i,
            field: "data",
            left: left.data,
            right: right.data,
            type: "changed",
          });
        }
        if (left.state.tokenCount !== right.state.tokenCount) {
          diffs.push({
            checkpointIndex: i,
            field: "state.tokenCount",
            left: left.state.tokenCount,
            right: right.state.tokenCount,
            type: "changed",
          });
        }
        if (left.state.costEstimate !== right.state.costEstimate) {
          diffs.push({
            checkpointIndex: i,
            field: "state.costEstimate",
            left: left.state.costEstimate,
            right: right.state.costEstimate,
            type: "changed",
          });
        }
      }
    }

    return diffs;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      id: this.id,
      agentId: this.agentId,
      prompt: this.prompt,
      checkpoints: this.checkpoints,
      cursor: this.cursor,
    });
  }

  static deserialize(json: string): DebugSessionImpl {
    const data = JSON.parse(json) as {
      id: string;
      agentId: string;
      prompt: string;
      checkpoints: DebugCheckpoint[];
      cursor: number;
    };
    const session = new DebugSessionImpl(data.id, data.agentId, data.prompt);
    for (const cp of data.checkpoints) {
      session.checkpoints.push(cp);
    }
    session.cursor = data.cursor;
    return session;
  }
}
