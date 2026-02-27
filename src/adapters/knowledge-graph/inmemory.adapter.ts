// =============================================================================
// InMemoryKnowledgeGraph — Adjacency list graph with BFS/DFS/Dijkstra
// =============================================================================

import type {
  KnowledgeGraphPort,
  GraphNode,
  GraphEdge,
  GraphQueryOptions,
  SubgraphResult,
} from "../../ports/knowledge-graph.port.js";

export class InMemoryKnowledgeGraphAdapter implements KnowledgeGraphPort {
  private nodes = new Map<string, GraphNode>();
  // adjacency: nodeId → Set of { target, edgeKey }
  private outEdges = new Map<string, Map<string, GraphEdge>>();
  private inEdges = new Map<string, Map<string, GraphEdge>>();

  private edgeKey(source: string, target: string): string {
    return `${source}::${target}`;
  }

  async addNodes(nodes: GraphNode[]): Promise<void> {
    for (const n of nodes) {
      this.nodes.set(n.id, { ...n });
      if (!this.outEdges.has(n.id)) this.outEdges.set(n.id, new Map());
      if (!this.inEdges.has(n.id)) this.inEdges.set(n.id, new Map());
    }
  }

  async addEdges(edges: GraphEdge[]): Promise<void> {
    for (const e of edges) {
      if (!this.nodes.has(e.source) || !this.nodes.has(e.target)) continue;
      if (e.weight < 0) throw new Error(`Edge weight must be non-negative, got ${e.weight} for ${e.source}->${e.target}`);
      const key = this.edgeKey(e.source, e.target);
      const edge = { ...e };
      this.outEdges.get(e.source)!.set(key, edge);
      this.inEdges.get(e.target)!.set(key, edge);
    }
  }

  async getNode(id: string): Promise<GraphNode | undefined> {
    return this.nodes.get(id);
  }

  async getNeighbors(nodeId: string, depth = 1): Promise<GraphNode[]> {
    const visited = new Set<string>();
    const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }];
    visited.add(nodeId);

    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (d >= depth) continue;
      const outMap = this.outEdges.get(id);
      if (outMap) {
        for (const edge of outMap.values()) {
          if (!visited.has(edge.target)) {
            visited.add(edge.target);
            queue.push({ id: edge.target, d: d + 1 });
          }
        }
      }
      const inMap = this.inEdges.get(id);
      if (inMap) {
        for (const edge of inMap.values()) {
          if (!visited.has(edge.source)) {
            visited.add(edge.source);
            queue.push({ id: edge.source, d: d + 1 });
          }
        }
      }
    }

    visited.delete(nodeId);
    return [...visited].map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  async query(options: GraphQueryOptions): Promise<SubgraphResult> {
    const { startNodeId, maxDepth = 3, edgeTypes, nodeTypes, limit } = options;
    const visited = new Set<string>();
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];
    const queue: Array<{ id: string; d: number }> = [{ id: startNodeId, d: 0 }];
    visited.add(startNodeId);
    const start = this.nodes.get(startNodeId);
    if (start) resultNodes.push(start);

    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (d >= maxDepth) continue;
      if (limit && resultNodes.length >= limit) break;

      const outMap = this.outEdges.get(id);
      if (outMap) {
        for (const edge of outMap.values()) {
          if (edgeTypes && !edgeTypes.includes(edge.type)) continue;
          const targetNode = this.nodes.get(edge.target);
          if (!targetNode) continue;
          if (nodeTypes && !nodeTypes.includes(targetNode.type)) continue;
          resultEdges.push(edge);
          if (!visited.has(edge.target)) {
            visited.add(edge.target);
            resultNodes.push(targetNode);
            queue.push({ id: edge.target, d: d + 1 });
          }
        }
      }
    }

    return { nodes: resultNodes, edges: resultEdges };
  }

  async shortestPath(fromId: string, toId: string): Promise<GraphNode[]> {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return [];
    if (fromId === toId) return [this.nodes.get(fromId)!];

    // Dijkstra
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const pq: Array<{ id: string; cost: number }> = [];

    dist.set(fromId, 0);
    pq.push({ id: fromId, cost: 0 });

    while (pq.length > 0) {
      pq.sort((a, b) => a.cost - b.cost);
      const { id, cost } = pq.shift()!;
      if (cost > (dist.get(id) ?? Infinity)) continue;
      if (id === toId) break;

      const outMap = this.outEdges.get(id);
      if (outMap) {
        for (const edge of outMap.values()) {
          const alt = cost + edge.weight;
          if (alt < (dist.get(edge.target) ?? Infinity)) {
            dist.set(edge.target, alt);
            prev.set(edge.target, id);
            pq.push({ id: edge.target, cost: alt });
          }
        }
      }
      // Bidirectional for undirected traversal
      const inMap = this.inEdges.get(id);
      if (inMap) {
        for (const edge of inMap.values()) {
          const alt = cost + edge.weight;
          if (alt < (dist.get(edge.source) ?? Infinity)) {
            dist.set(edge.source, alt);
            prev.set(edge.source, id);
            pq.push({ id: edge.source, cost: alt });
          }
        }
      }
    }

    if (!prev.has(toId) && fromId !== toId) return [];

    const path: GraphNode[] = [];
    let cur: string | undefined = toId;
    while (cur !== undefined) {
      const node = this.nodes.get(cur);
      if (node) path.unshift(node);
      cur = prev.get(cur);
    }
    return path;
  }

  async subgraph(nodeIds: string[]): Promise<SubgraphResult> {
    const idSet = new Set(nodeIds);
    const nodes = nodeIds.map((id) => this.nodes.get(id)).filter(Boolean) as GraphNode[];
    const edges: GraphEdge[] = [];
    for (const id of nodeIds) {
      const outMap = this.outEdges.get(id);
      if (outMap) {
        for (const edge of outMap.values()) {
          if (idSet.has(edge.target)) edges.push(edge);
        }
      }
    }
    return { nodes, edges };
  }

  async removeNodes(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.nodes.delete(id);
      // Remove all edges involving this node
      const outMap = this.outEdges.get(id);
      if (outMap) {
        for (const edge of outMap.values()) {
          this.inEdges.get(edge.target)?.delete(this.edgeKey(edge.source, edge.target));
        }
      }
      const inMap = this.inEdges.get(id);
      if (inMap) {
        for (const edge of inMap.values()) {
          this.outEdges.get(edge.source)?.delete(this.edgeKey(edge.source, edge.target));
        }
      }
      this.outEdges.delete(id);
      this.inEdges.delete(id);
    }
  }

  async removeEdges(pairs: Array<{ source: string; target: string }>): Promise<void> {
    for (const { source, target } of pairs) {
      const key = this.edgeKey(source, target);
      this.outEdges.get(source)?.delete(key);
      this.inEdges.get(target)?.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.nodes.clear();
    this.outEdges.clear();
    this.inEdges.clear();
  }

  async stats(): Promise<{ nodeCount: number; edgeCount: number }> {
    let edgeCount = 0;
    for (const m of this.outEdges.values()) edgeCount += m.size;
    return { nodeCount: this.nodes.size, edgeCount };
  }
}
