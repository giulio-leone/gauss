// =============================================================================
// GraphVisualizationPort — Contract for graph rendering
// =============================================================================

export interface GraphDescriptor {
  nodes: { id: string; type: "agent" | "graph"; label?: string }[];
  edges: { from: string; to: string }[];
  forks: { id: string; nodeIds: string[] }[];
}

export interface GraphVisualizationPort {
  toAscii(graph: GraphDescriptor): string;
  toMermaid(graph: GraphDescriptor): string;
}
