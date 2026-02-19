// =============================================================================
// ForkCoordinator — Manages parallel fork execution with partial results
// =============================================================================

import type { NodeResult } from "./agent-node.js";

export class ForkCoordinator {
  private readonly results = new Map<string, NodeResult>();
  private readonly errors = new Map<string, Error>();
  private readonly total: number;
  private resolveAll!: (results: NodeResult[]) => void;
  private rejectAll!: (error: Error) => void;
  readonly promise: Promise<NodeResult[]>;
  private timeoutTimer?: ReturnType<typeof setTimeout>;
  private settled = false;

  constructor(
    private readonly forkId: string,
    nodeIds: string[],
    timeoutMs: number,
    private readonly minResults: number,
    private readonly onPartial?: (results: NodeResult[]) => void,
  ) {
    this.total = nodeIds.length;
    this.promise = new Promise((resolve, reject) => {
      this.resolveAll = resolve;
      this.rejectAll = reject;
    });

    this.timeoutTimer = setTimeout(() => {
      if (this.settled) return;
      if (this.results.size >= this.minResults) {
        this.settle();
        this.resolveAll([...this.results.values()]);
      } else {
        this.settle();
        this.rejectAll(
          new Error(
            `Fork "${forkId}" timeout: only ${this.results.size}/${this.total} ` +
              `completed (minimum: ${this.minResults})`,
          ),
        );
      }
    }, timeoutMs);
  }

  onNodeComplete(nodeId: string, result: NodeResult): void {
    if (this.settled) return;
    this.results.set(nodeId, result);
    this.onPartial?.([...this.results.values()]);

    if (this.results.size === this.total) {
      this.settle();
      this.resolveAll([...this.results.values()]);
    }
  }

  onNodeError(nodeId: string, error: Error): void {
    if (this.settled) return;
    this.errors.set(nodeId, error);

    if (this.errors.size > this.total - this.minResults) {
      this.settle();
      this.rejectAll(
        new Error(
          `Fork "${this.forkId}": too many failures (${this.errors.size}/${this.total})`,
        ),
      );
    }
  }

  dispose(): void {
    this.settle();
  }

  private settle(): void {
    if (this.settled) return;
    this.settled = true;
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }
}
