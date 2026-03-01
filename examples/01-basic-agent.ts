// =============================================================================
// 01 — Basic Agent, gauss() shorthand, and batch() for parallel execution
// =============================================================================
//
// Demonstrates the three main ways to run prompts:
//   1. Agent class — full control over provider, model, and options
//   2. gauss()     — one-liner shorthand (auto-detects provider from env)
//   3. batch()     — run multiple prompts in parallel with concurrency control
//
// Usage: npx tsx examples/01-basic-agent.ts

import { Agent, gauss, batch } from "gauss-ai";

async function main(): Promise<void> {
  // ── 1. Full Agent ──────────────────────────────────────────────────
  const agent = new Agent({
    name: "assistant",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You are a helpful coding assistant. Be concise.",
    temperature: 0.7,
    maxSteps: 5,
  });

  const result = await agent.run("List three best practices for writing unit tests.");
  console.log("Response:", result.text);
  console.log(`Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);

  // ── 2. gauss() shorthand ───────────────────────────────────────────
  // Auto-detects provider from environment variables (OPENAI_API_KEY, etc.)
  const answer = await gauss("What is the capital of France?");
  console.log("Quick answer:", answer);

  // ── 3. batch() for parallel prompts ────────────────────────────────
  const items = await batch(
    ["Translate 'hello' to French", "Translate 'hello' to Spanish", "Translate 'hello' to Japanese"],
    { provider: "openai", model: "gpt-4o", concurrency: 3 },
  );
  for (const item of items) {
    console.log(`[batch] ${item.input} → ${item.result?.text ?? item.error?.message}`);
  }

  agent.destroy();
}

main().catch(console.error);
