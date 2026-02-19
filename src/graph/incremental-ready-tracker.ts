// =============================================================================
// IncrementalReadyTracker — Incremental Kahn's algorithm
// =============================================================================

export class IncrementalReadyTracker {
  /** nodeId → number of pending (uncompleted) dependencies */
  private readonly pendingDeps: Map<string, number>;
  /** nodeId → list of successor nodeIds (reverse edges) */
  private readonly successors: Map<string, string[]>;
  /** Callback invoked when a node becomes ready (all deps satisfied) */
  private readonly onReady: (nodeId: string) => void;

  constructor(
    edges: ReadonlyMap<string, readonly string[]>,
    allNodeIds: Iterable<string>,
    onReady: (nodeId: string) => void,
  ) {
    this.onReady = onReady;
    this.pendingDeps = new Map();
    this.successors = new Map();

    // Build reverse graph + dependency counts
    for (const nodeId of allNodeIds) {
      const deps = edges.get(nodeId) ?? [];
      this.pendingDeps.set(nodeId, deps.length);

      for (const dep of deps) {
        let succ = this.successors.get(dep);
        if (!succ) {
          succ = [];
          this.successors.set(dep, succ);
        }
        succ.push(nodeId);
      }
    }
  }

  /** Emit all nodes with zero dependencies */
  seedInitialReady(): void {
    for (const [nodeId, count] of this.pendingDeps) {
      if (count === 0) {
        this.onReady(nodeId);
      }
    }
  }

  /** Mark a node as completed; returns list of newly-ready successors */
  markCompleted(nodeId: string): string[] {
    const newlyReady: string[] = [];
    const succs = this.successors.get(nodeId) ?? [];

    for (const succ of succs) {
      const remaining = this.pendingDeps.get(succ)! - 1;
      this.pendingDeps.set(succ, remaining);

      if (remaining === 0) {
        newlyReady.push(succ);
        this.onReady(succ);
      }
    }

    return newlyReady;
  }

  /** Snapshot current pending-deps state for checkpoint */
  snapshot(): Map<string, number> {
    return new Map(this.pendingDeps);
  }

  /** Restore from a previously taken snapshot */
  restoreFrom(snap: Map<string, number>): void {
    for (const [k, v] of snap) {
      this.pendingDeps.set(k, v);
    }
  }
}
