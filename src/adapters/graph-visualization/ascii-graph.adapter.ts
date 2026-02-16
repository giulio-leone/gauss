// =============================================================================
// AsciiGraphAdapter — Renders a GraphDescriptor as ASCII box art
// =============================================================================

import type {
  GraphVisualizationPort,
  GraphDescriptor,
} from "../../ports/graph-visualization.port.js";

export class AsciiGraphAdapter implements GraphVisualizationPort {
  toAscii(graph: GraphDescriptor): string {
    if (graph.nodes.length === 0) return "(empty graph)";

    const ordered = this.topologicalSort(graph);
    const forkMap = new Map(graph.forks.map((f) => [f.id, f.nodeIds]));
    const lines: string[] = [];

    // Render main flow
    const boxes = ordered.map((id) => {
      const node = graph.nodes.find((n) => n.id === id)!;
      return this.renderBox(node.label ?? node.id, node.type);
    });
    const topLine = boxes.map((b) => b[0]).join("     ");
    const midLine = boxes.map((b) => b[1]).join(" ──→ ");
    const typLine = boxes.map((b) => b[2]).join("     ");
    const botLine = boxes.map((b) => b[3]).join("     ");
    lines.push(topLine, midLine, typLine, botLine);

    // Render forks below their parent node
    for (const [forkId, nodeIds] of forkMap) {
      const idx = ordered.indexOf(forkId);
      if (idx < 0) continue;
      const offset = this.computeOffset(boxes, idx);
      lines.push("");
      const forkLines = this.renderFork(forkId, nodeIds);
      for (const fl of forkLines) {
        lines.push(" ".repeat(offset) + fl);
      }
    }

    return lines.join("\n");
  }

  toMermaid(_graph: GraphDescriptor): string {
    throw new Error("Use MermaidGraphAdapter for Mermaid output");
  }

  private renderBox(label: string, type: string): [string, string, string, string] {
    const inner = Math.max(label.length, type.length + 2);
    const pad = (s: string) => s.padEnd(inner);
    return [
      `┌${"─".repeat(inner + 2)}┐`,
      `│ ${pad(label)} │`,
      `│ ${pad(`(${type})`)} │`,
      `└${"─".repeat(inner + 2)}┘`,
    ];
  }

  private renderFork(id: string, nodeIds: string[]): string[] {
    const miniBoxLine = nodeIds.map((nid) => {
      const w = nid.length + 2;
      return `┌${"─".repeat(w)}┐`;
    }).join("");
    const miniMidLine = nodeIds.map((nid) => `│ ${nid} │`).join("");
    const miniBotLine = nodeIds.map((nid) => {
      const w = nid.length + 2;
      return `└${"─".repeat(w)}┘`;
    }).join("");
    const contentWidth = Math.max(id.length + 2, miniMidLine.length + 2);
    const padCenter = (s: string) => {
      const leftPad = Math.floor((contentWidth - s.length) / 2);
      return " ".repeat(Math.max(0, leftPad)) + s;
    };

    const dashesTotal = contentWidth - 1; // -1 for the ┴ character
    const leftDashes = Math.floor(dashesTotal / 2);
    const rightDashes = dashesTotal - leftDashes;

    return [
      " ".repeat(Math.floor(contentWidth / 2)) + "│",
      `┌${"─".repeat(leftDashes)}┴${"─".repeat(rightDashes)}┐`,
      `│${padCenter(id)}${" ".repeat(Math.max(0, contentWidth - padCenter(id).length))}│`,
      `│${padCenter(miniBoxLine)}${" ".repeat(Math.max(0, contentWidth - padCenter(miniBoxLine).length))}│`,
      `│${padCenter(miniMidLine)}${" ".repeat(Math.max(0, contentWidth - padCenter(miniMidLine).length))}│`,
      `│${padCenter(miniBotLine)}${" ".repeat(Math.max(0, contentWidth - padCenter(miniBotLine).length))}│`,
      `└${"─".repeat(contentWidth)}┘`,
    ];
  }

  private computeOffset(boxes: [string, string, string, string][], idx: number): number {
    let offset = 0;
    for (let i = 0; i < idx; i++) {
      offset += boxes[i][0].length + 5; // 5 = "     " or " ──→ "
    }
    return offset;
  }

  private topologicalSort(graph: GraphDescriptor): string[] {
    const adjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const n of graph.nodes) {
      adjacency.set(n.id, []);
      inDegree.set(n.id, 0);
    }
    for (const e of graph.edges) {
      adjacency.get(e.from)?.push(e.to);
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    }
    const queue = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
    const result: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);
      for (const next of adjacency.get(id) ?? []) {
        const deg = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, deg);
        if (deg === 0) queue.push(next);
      }
    }
    return result;
  }
}
