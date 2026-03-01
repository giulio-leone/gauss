// =============================================================================
// 12 — Workflow DSL with sequential, dependency-based steps
// =============================================================================
//
// Workflows define multi-step pipelines where each step is backed by an Agent.
// Steps can have explicit dependencies for automatic ordering.
//
// Usage: npx tsx examples/12-workflow-dsl.ts

import { Agent, Workflow } from "gauss-ai";

async function main(): Promise<void> {
  // ── Create step agents ─────────────────────────────────────────────
  const ideator = new Agent({
    name: "ideator",
    instructions: "You brainstorm creative ideas. Output a numbered list.",
  });

  const researcher = new Agent({
    name: "researcher",
    instructions: "You research and expand on ideas with facts and data.",
  });

  const writer = new Agent({
    name: "writer",
    instructions: "You write polished content from research. Output a complete article.",
  });

  const editor = new Agent({
    name: "editor",
    instructions: "You proofread and improve writing quality. Output the final version.",
  });

  // ── Build workflow with dependencies ───────────────────────────────
  const workflow = new Workflow()
    .addStep({ stepId: "ideate", agent: ideator, instructions: "Generate 5 blog post ideas about AI agents" })
    .addStep({ stepId: "research", agent: researcher, instructions: "Research the best idea in depth" })
    .addStep({ stepId: "write", agent: writer, instructions: "Write the full blog post" })
    .addStep({ stepId: "edit", agent: editor, instructions: "Polish and finalize the article" })
    .addDependency("research", "ideate")   // research waits for ideation
    .addDependency("write", "research")     // writing waits for research
    .addDependency("edit", "write");        // editing waits for writing

  // ── Execute ────────────────────────────────────────────────────────
  console.log("Running content workflow...\n");
  const result = await workflow.run("Write a blog post about building AI agents with Rust and TypeScript");

  console.log("Workflow results:");
  for (const [stepId, output] of Object.entries(result)) {
    const text = typeof output === "string" ? output : JSON.stringify(output);
    console.log(`\n[${stepId}] ${text.slice(0, 200)}...`);
  }

  // ── Cleanup ────────────────────────────────────────────────────────
  workflow.destroy();
  ideator.destroy();
  researcher.destroy();
  writer.destroy();
  editor.destroy();
}

main().catch(console.error);
