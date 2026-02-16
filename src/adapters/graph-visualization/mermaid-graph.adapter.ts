// =============================================================================
// MermaidGraphAdapter — Renders a GraphDescriptor as Mermaid flowchart syntax
// =============================================================================

import type {
  GraphVisualizationPort,
  GraphDescriptor,
} from "../../ports/graph-visualization.port.js";

export class MermaidGraphAdapter implements GraphVisualizationPort {
  toAscii(_graph: GraphDescriptor): string {
    throw new Error("Use AsciiGraphAdapter for ASCII output");
  }

  toMermaid(graph: GraphDescriptor): string {
    const lines: string[] = ["graph LR"];
    const forkNodeIds = new Set(graph.forks.flatMap((f) => f.nodeIds));
    const sanitize = (id: string) => id.replace(/-/g, "_");

    // Node declarations (skip fork-internal nodes, they go inside subgraph)
    for (const node of graph.nodes) {
      if (forkNodeIds.has(node.id)) continue;
      const sid = sanitize(node.id);
      const label = node.label ?? node.id;
      lines.push(`  ${sid}[${label}<br>${node.type}]`);
    }

    // Edges
    for (const edge of graph.edges) {
      lines.push(`  ${sanitize(edge.from)} --> ${sanitize(edge.to)}`);
    }

    // Forks as subgraphs
    for (const fork of graph.forks) {
      lines.push(`  subgraph ${fork.id}`);
      for (const nid of fork.nodeIds) {
        const node = graph.nodes.find((n) => n.id === nid);
        const label = node?.label ?? nid;
        const type = node?.type ?? "agent";
        lines.push(`    ${sanitize(nid)}[${label}<br>${type}]`);
      }
      lines.push("  end");
    }

    return lines.join("\n");
  }
}
