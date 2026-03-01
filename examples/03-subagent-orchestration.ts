// =============================================================================
// 03 — Multi-agent orchestration with Team
// =============================================================================
//
// Uses the Team class to coordinate multiple specialized agents.
// Each agent runs sequentially — the output of one feeds the next.
//
// Usage: npx tsx examples/03-subagent-orchestration.ts

import { Agent, Team } from "gauss-ts";

async function main(): Promise<void> {
  // ── Specialized agents ─────────────────────────────────────────────
  const researcher = new Agent({
    name: "researcher",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You are a research specialist. Provide detailed findings on the given topic.",
  });

  const writer = new Agent({
    name: "writer",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You are a technical writer. Take research findings and produce a clear, structured summary.",
  });

  const reviewer = new Agent({
    name: "reviewer",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You are a code/content reviewer. Review the text for accuracy and suggest improvements.",
  });

  // ── Team: sequential pipeline ──────────────────────────────────────
  const team = new Team("content-team")
    .add(researcher, "Research the topic thoroughly")
    .add(writer, "Write a structured article from the research")
    .add(reviewer, "Review and refine the final article")
    .strategy("sequential");

  const result = await team.run("Explain the benefits of Rust for building AI agent frameworks");

  console.log("Final output:", result.finalText);
  for (const [i, r] of result.results.entries()) {
    console.log(`  Agent ${i}: ${r.steps} steps, ${r.inputTokens + r.outputTokens} tokens`);
  }

  // ── Cleanup ────────────────────────────────────────────────────────
  team.destroy();
  researcher.destroy();
  writer.destroy();
  reviewer.destroy();
}

main().catch(console.error);
