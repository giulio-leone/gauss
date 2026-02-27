// =============================================================================
// KnowledgeGraphPort — Abstract knowledge graph operations
// =============================================================================

export interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  embedding?: number[];
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  properties: Record<string, unknown>;
}

export interface GraphQueryOptions {
  startNodeId: string;
  maxDepth?: number;
  edgeTypes?: string[];
  nodeTypes?: string[];
  limit?: number;
}

export interface SubgraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface KnowledgeGraphPort {
  addNodes(nodes: GraphNode[]): Promise<void>;
  addEdges(edges: GraphEdge[]): Promise<void>;
  getNode(id: string): Promise<GraphNode | undefined>;
  getNeighbors(nodeId: string, depth?: number): Promise<GraphNode[]>;
  query(options: GraphQueryOptions): Promise<SubgraphResult>;
  shortestPath(fromId: string, toId: string): Promise<GraphNode[]>;
  subgraph(nodeIds: string[]): Promise<SubgraphResult>;
  removeNodes(ids: string[]): Promise<void>;
  removeEdges(sourceTarget: Array<{ source: string; target: string }>): Promise<void>;
  clear(): Promise<void>;
  stats(): Promise<{ nodeCount: number; edgeCount: number }>;
}
