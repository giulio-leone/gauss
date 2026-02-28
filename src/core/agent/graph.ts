// =============================================================================
// Gauss Agent Core — graph() Factory
// Simple DAG execution of Agent instances.
// =============================================================================

import type { AgentInstance, AgentResult } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphConfig {
  nodes: Record<string, AgentInstance>;
  edges: Array<{ from: string; to: string }>;
  conditions?: Record<string, (result: AgentResult) => boolean>;
}

export interface GraphResult {
  /** Final output from the terminal node(s) */
  output: string;
  /** Results from all nodes */
  nodeResults: Map<string, AgentResult>;
  /** Total duration in ms */
  duration: number;
}

export interface GraphPipeline {
  run(input: string): Promise<GraphResult>;
}

// ---------------------------------------------------------------------------
// graph() factory
// ---------------------------------------------------------------------------

/**
 * Create a DAG pipeline of Agent instances.
 *
 * @example
 * ```ts
 * const pipeline = graph({
 *   nodes: { research: researchAgent, write: writeAgent, review: reviewAgent },
 *   edges: [
 *     { from: "research", to: "write" },
 *     { from: "write", to: "review" },
 *   ],
 * });
 * const result = await pipeline.run("Write an article about AI");
 * ```
 */
export function graph(config: GraphConfig): GraphPipeline {
  validateGraph(config);

  return {
    async run(input: string): Promise<GraphResult> {
      const startTime = performance.now();
      const nodeResults = new Map<string, AgentResult>();

      // Build dependency map: nodeId → [nodes it depends on]
      const deps = new Map<string, string[]>();
      for (const nodeId of Object.keys(config.nodes)) {
        deps.set(nodeId, []);
      }
      for (const edge of config.edges) {
        deps.get(edge.to)!.push(edge.from);
      }

      // Topological execution
      const executed = new Set<string>();
      const nodeIds = Object.keys(config.nodes);

      while (executed.size < nodeIds.length) {
        // Find ready nodes (all deps satisfied)
        const ready = nodeIds.filter(
          (id) =>
            !executed.has(id) &&
            deps.get(id)!.every((dep) => executed.has(dep)),
        );

        if (ready.length === 0) {
          throw new Error("Graph execution stalled — check for cycles");
        }

        // Execute ready nodes in parallel
        await Promise.all(
          ready.map(async (nodeId) => {
            const agent = config.nodes[nodeId];
            const depResults = deps.get(nodeId)!;

            // Build prompt with upstream results
            let prompt = input;
            if (depResults.length > 0) {
              const contextParts = depResults.map((depId) => {
                const depResult = nodeResults.get(depId);
                return `[${depId}]: ${depResult?.text ?? ""}`;
              });
              prompt = `${input}\n\n--- Previous results ---\n${contextParts.join("\n")}`;
            }

            // Check edge conditions
            const edgeKey = depResults.length === 1
              ? `${depResults[0]}->${nodeId}`
              : undefined;
            if (edgeKey && config.conditions?.[edgeKey]) {
              const depResult = nodeResults.get(depResults[0]);
              if (depResult && !config.conditions[edgeKey](depResult)) {
                // Condition not met — skip this node
                executed.add(nodeId);
                return;
              }
            }

            const result = await agent.run(prompt);
            nodeResults.set(nodeId, result);
            executed.add(nodeId);
          }),
        );
      }

      // Find terminal nodes (no outgoing edges)
      const hasOutgoing = new Set(config.edges.map((e) => e.from));
      const terminals = nodeIds.filter((id) => !hasOutgoing.has(id));
      const terminalOutputs = terminals
        .map((id) => nodeResults.get(id)?.text ?? "")
        .filter(Boolean);

      return {
        output: terminalOutputs.join("\n\n"),
        nodeResults,
        duration: performance.now() - startTime,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateGraph(config: GraphConfig): void {
  const nodeIds = new Set(Object.keys(config.nodes));

  for (const edge of config.edges) {
    if (!nodeIds.has(edge.from)) {
      throw new Error(`Edge source "${edge.from}" is not a registered node`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new Error(`Edge target "${edge.to}" is not a registered node`);
    }
  }

  // Cycle detection (simple DFS)
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const adjList = new Map<string, string[]>();
  for (const id of nodeIds) adjList.set(id, []);
  for (const edge of config.edges) {
    adjList.get(edge.from)!.push(edge.to);
  }

  function dfs(node: string): boolean {
    visited.add(node);
    inStack.add(node);
    for (const neighbor of adjList.get(node) ?? []) {
      if (inStack.has(neighbor)) return true; // cycle
      if (!visited.has(neighbor) && dfs(neighbor)) return true;
    }
    inStack.delete(node);
    return false;
  }

  for (const id of nodeIds) {
    if (!visited.has(id) && dfs(id)) {
      throw new Error("Graph contains a cycle");
    }
  }
}
