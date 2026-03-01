// =============================================================================
// 16 — Telemetry + EvalRunner for LLM recording and evaluation
// =============================================================================
//
// Records agent interactions via Telemetry spans, then uses EvalRunner
// to evaluate outputs with configurable scorers.
//
// Usage: npx tsx examples/16-llm-recording.ts

import { Agent, Telemetry, EvalRunner } from "gauss-ai";

async function main(): Promise<void> {
  const telemetry = new Telemetry();

  // ── 1. Record agent interactions ───────────────────────────────────
  const agent = new Agent({
    name: "recorded-agent",
    provider: "openai",
    model: "gpt-4o",
    instructions: "Answer factual questions accurately and concisely.",
    temperature: 0,
  });

  const questions = [
    "What is the capital of France?",
    "Who wrote 'Romeo and Juliet'?",
    "What is 2 + 2?",
  ];

  console.log("Recording agent interactions...\n");
  const recordings: Array<{ prompt: string; response: string; durationMs: number }> = [];

  for (const q of questions) {
    const start = Date.now();
    const result = await agent.run(q);
    const durationMs = Date.now() - start;

    telemetry.recordSpan("llm.call", durationMs, {
      prompt: q,
      response: result.text,
      tokens: result.inputTokens + result.outputTokens,
    });

    recordings.push({ prompt: q, response: result.text, durationMs });
    console.log(`  Q: ${q}`);
    console.log(`  A: ${result.text} (${durationMs}ms)\n`);
  }

  // ── 2. Export telemetry ────────────────────────────────────────────
  console.log("Spans recorded:", JSON.stringify(telemetry.exportSpans(), null, 2).slice(0, 300));
  console.log("Metrics:", telemetry.exportMetrics());

  // ── 3. Evaluate with EvalRunner ────────────────────────────────────
  const evalRunner = new EvalRunner(0.5); // threshold = 0.5
  evalRunner.addScorer("exact_match");
  evalRunner.addScorer("contains");
  evalRunner.addScorer("length_ratio");

  // Load a dataset for evaluation
  const dataset = JSON.stringify([
    { input: "What is the capital of France?", expected: "Paris" },
    { input: "Who wrote Romeo and Juliet?", expected: "Shakespeare" },
    { input: "What is 2 + 2?", expected: "4" },
  ]);
  const parsed = EvalRunner.loadDatasetJson(dataset);
  console.log("\nEval dataset loaded:", parsed);

  // ── Cleanup ────────────────────────────────────────────────────────
  evalRunner.destroy();
  telemetry.destroy();
  agent.destroy();
}

main().catch(console.error);
