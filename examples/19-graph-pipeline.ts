// =============================================================================
// 19 — Graph Pipeline with fork/join nodes
// =============================================================================
//
// The Graph class builds a DAG (directed acyclic graph) of agent nodes.
// Supports linear chains, fork nodes (parallel execution), and edge-based
// routing. All orchestration runs in Rust core.
//
// Usage: npx tsx examples/19-graph-pipeline.ts

import { Agent, Graph } from "gauss-ts";

async function main(): Promise<void> {
  // ── Create specialized agents ──────────────────────────────────────
  const researcher = new Agent({
    name: "researcher",
    instructions: "You research topics in depth. Provide detailed findings.",
  });

  const analyst = new Agent({
    name: "analyst",
    instructions: "You analyze data and identify key patterns and insights.",
  });

  const writer = new Agent({
    name: "writer",
    instructions: "You write clear, engaging content from source material.",
  });

  const editor = new Agent({
    name: "editor",
    instructions: "You review and polish text for publication quality.",
  });

  // ── Linear graph: research → write → edit ──────────────────────────
  console.log("=== Linear Graph ===\n");
  const linear = new Graph()
    .addNode({ nodeId: "research", agent: researcher })
    .addNode({ nodeId: "write", agent: writer })
    .addNode({ nodeId: "edit", agent: editor })
    .addEdge("research", "write")
    .addEdge("write", "edit");

  const linearResult = await linear.run("Write about the future of AI agents");
  console.log("Linear result keys:", Object.keys(linearResult));
  for (const [nodeId, output] of Object.entries(linearResult)) {
    const text = typeof output === "string" ? output : JSON.stringify(output);
    console.log(`  [${nodeId}] ${text.slice(0, 100)}...`);
  }

  // ── Fork/join graph: parallel research + analysis → synthesis ──────
  console.log("\n=== Fork/Join Graph ===\n");
  const forkJoin = new Graph()
    .addFork({
      nodeId: "parallel-research",
      agents: [
        { agent: researcher, instructions: "Research the technical aspects" },
        { agent: analyst, instructions: "Analyze the market implications" },
      ],
      consensus: "concat", // Concatenate both outputs
    })
    .addNode({ nodeId: "synthesize", agent: writer, instructions: "Combine the research and analysis into a cohesive article" })
    .addEdge("parallel-research", "synthesize");

  const forkResult = await forkJoin.run("The impact of Rust in systems programming");
  console.log("Fork/join result keys:", Object.keys(forkResult));

  // ── Cleanup ────────────────────────────────────────────────────────
  linear.destroy();
  forkJoin.destroy();
  researcher.destroy();
  analyst.destroy();
  writer.destroy();
  editor.destroy();
}

main().catch(console.error);
