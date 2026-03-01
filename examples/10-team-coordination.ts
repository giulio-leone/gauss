// =============================================================================
// 10 — Team Coordination with different strategies
// =============================================================================
//
// Demonstrates Team with sequential and parallel strategies.
// Sequential: output of one agent feeds the next.
// Parallel: all agents run simultaneously on the same prompt.
//
// Usage: npx tsx examples/10-team-coordination.ts

import { Agent, Team } from "gauss-ai";

async function main(): Promise<void> {
  const analyst = new Agent({
    name: "analyst",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You analyze data and extract key metrics. Be quantitative.",
  });

  const strategist = new Agent({
    name: "strategist",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You develop business strategies based on analysis. Focus on actionable steps.",
  });

  const writer = new Agent({
    name: "writer",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You write executive summaries. Be clear and concise.",
  });

  // ── Sequential: analyst → strategist → writer ──────────────────────
  console.log("=== Sequential Team ===\n");
  const seqTeam = new Team("sequential-team")
    .add(analyst, "Analyze the Q4 sales data")
    .add(strategist, "Develop strategy from the analysis")
    .add(writer, "Write an executive summary")
    .strategy("sequential");

  const seqResult = await seqTeam.run(
    "Q4 sales were $2.5M (+35% YoY). Top product: Enterprise Plan. Churn dropped to 3%.",
  );
  console.log("Sequential result:", seqResult.finalText.slice(0, 300), "...\n");

  // ── Parallel: all agents work independently ────────────────────────
  console.log("=== Parallel Team ===\n");
  const parTeam = new Team("parallel-team")
    .add(analyst, "Provide your perspective on this data")
    .add(strategist, "Provide your perspective on this data")
    .add(writer, "Provide your perspective on this data")
    .strategy("parallel");

  const parResult = await parTeam.run(
    "Should we expand into the European market given our current growth?",
  );
  console.log("Parallel result:", parResult.finalText.slice(0, 300), "...\n");

  // Print token usage per agent
  for (const [i, r] of parResult.results.entries()) {
    console.log(`  Agent ${i}: ${r.inputTokens} in / ${r.outputTokens} out`);
  }

  // ── Cleanup ────────────────────────────────────────────────────────
  seqTeam.destroy();
  parTeam.destroy();
  analyst.destroy();
  strategist.destroy();
  writer.destroy();
}

main().catch(console.error);
