// =============================================================================
// DynamicAgentGraph — AgentGraph with runtime mutation support
// =============================================================================

import { AgentNode, type AgentNodeConfig } from "./agent-node.js";
import type { EventBus } from "../agent/event-bus.js";

export type MutationType =
  | "add-node"
  | "remove-node"
  | "replace-node"
  | "add-edge"
  | "remove-edge";

export interface MutationEntry {
  id: string;
  type: MutationType;
  timestamp: number;
  actorId: string;
  payload: unknown;
  status: "applied" | "rejected";
  rejectionReason?: string;
}

export interface MutationResult {
  success: boolean;
  mutationId: string;
  violations?: { invariant: string; description: string }[];
}

function newMutationId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class DynamicAgentGraph {
  // edges[to] = [from, ...] — same convention as AgentGraph
  private readonly nodes = new Map<string, AgentNode>();
  private readonly edges = new Map<string, string[]>();
  private readonly log: MutationEntry[] = [];

  constructor(private readonly eventBus?: EventBus) {}

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  addNode(config: AgentNodeConfig, actorId: string): MutationResult {
    if (this.nodes.has(config.id)) {
      return this.recordReject("add-node", actorId, config, [
        { invariant: "node-unique", description: `Node "${config.id}" already exists` },
      ]);
    }
    this.nodes.set(config.id, new AgentNode(config));
    return this.recordApply("add-node", actorId, config);
  }

  removeNode(nodeId: string, actorId: string): MutationResult {
    if (!this.nodes.has(nodeId)) {
      return this.recordReject("remove-node", actorId, { nodeId }, [
        { invariant: "node-exists", description: `Node "${nodeId}" does not exist` },
      ]);
    }
    // Reject if any other node depends on this one
    const dependents: string[] = [];
    for (const [target, sources] of this.edges) {
      if (sources.includes(nodeId)) dependents.push(target);
    }
    if (dependents.length > 0) {
      return this.recordReject("remove-node", actorId, { nodeId }, [
        {
          invariant: "no-dependents",
          description: `Node "${nodeId}" is depended upon by: ${dependents.join(", ")}`,
        },
      ]);
    }
    this.nodes.delete(nodeId);
    // Remove any edges where nodeId is the target
    this.edges.delete(nodeId);
    return this.recordApply("remove-node", actorId, { nodeId });
  }

  replaceNode(nodeId: string, newConfig: AgentNodeConfig, actorId: string): MutationResult {
    if (!this.nodes.has(nodeId)) {
      return this.recordReject("replace-node", actorId, { nodeId, newConfig }, [
        { invariant: "node-exists", description: `Node "${nodeId}" does not exist` },
      ]);
    }
    // Hot-swap: keep the same id so existing edges remain valid
    this.nodes.set(nodeId, new AgentNode({ ...newConfig, id: nodeId }));
    return this.recordApply("replace-node", actorId, { nodeId, newConfig });
  }

  addEdge(from: string, to: string, actorId: string): MutationResult {
    const violations: { invariant: string; description: string }[] = [];
    if (!this.nodes.has(from)) {
      violations.push({ invariant: "node-exists", description: `Node "${from}" does not exist` });
    }
    if (!this.nodes.has(to)) {
      violations.push({ invariant: "node-exists", description: `Node "${to}" does not exist` });
    }
    if (violations.length > 0) {
      return this.recordReject("add-edge", actorId, { from, to }, violations);
    }
    if (this.wouldCreateCycle(from, to)) {
      return this.recordReject("add-edge", actorId, { from, to }, [
        {
          invariant: "no-cycle",
          description: `Adding edge "${from}"→"${to}" would create a cycle`,
        },
      ]);
    }
    const deps = this.edges.get(to) ?? [];
    deps.push(from);
    this.edges.set(to, deps);
    return this.recordApply("add-edge", actorId, { from, to });
  }

  removeEdge(from: string, to: string, actorId: string): MutationResult {
    const sources = this.edges.get(to);
    if (!sources?.includes(from)) {
      return this.recordReject("remove-edge", actorId, { from, to }, [
        { invariant: "edge-exists", description: `Edge "${from}"→"${to}" does not exist` },
      ]);
    }
    const updated = sources.filter((s) => s !== from);
    if (updated.length === 0) {
      this.edges.delete(to);
    } else {
      this.edges.set(to, updated);
    }
    return this.recordApply("remove-edge", actorId, { from, to });
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  getNodes(): ReadonlyMap<string, AgentNode> {
    return this.nodes;
  }

  getEdges(): ReadonlyMap<string, readonly string[]> {
    return this.edges;
  }

  getMutationLog(): readonly MutationEntry[] {
    return this.log;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** DFS from `to` in the forward-edge direction to detect if `from` is reachable. */
  private wouldCreateCycle(from: string, to: string): boolean {
    // Build forward adjacency: source → [target, ...]
    const fwdAdj = new Map<string, string[]>();
    for (const [target, sources] of this.edges) {
      for (const source of sources) {
        const list = fwdAdj.get(source) ?? [];
        list.push(target);
        fwdAdj.set(source, list);
      }
    }
    // DFS from `to`, looking for `from`
    const visited = new Set<string>();
    const stack: string[] = [to];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === from) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of fwdAdj.get(current) ?? []) stack.push(next);
    }
    return false;
  }

  private recordApply(type: MutationType, actorId: string, payload: unknown): MutationResult {
    const id = newMutationId();
    const entry: MutationEntry = { id, type, timestamp: Date.now(), actorId, payload, status: "applied" };
    this.log.push(entry);
    this.eventBus?.emit("graph:mutation", { mutationId: id, type, actorId, status: "applied" });
    return { success: true, mutationId: id };
  }

  private recordReject(
    type: MutationType,
    actorId: string,
    payload: unknown,
    violations: { invariant: string; description: string }[],
  ): MutationResult {
    const id = newMutationId();
    const rejectionReason = violations.map((v) => v.description).join("; ");
    const entry: MutationEntry = {
      id,
      type,
      timestamp: Date.now(),
      actorId,
      payload,
      status: "rejected",
      rejectionReason,
    };
    this.log.push(entry);
    this.eventBus?.emit("graph:mutation", { mutationId: id, type, actorId, status: "rejected", rejectionReason });
    return { success: false, mutationId: id, violations };
  }
}
