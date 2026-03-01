// =============================================================================
// 22 — DX Utilities: template(), pipe(), mapAsync(), compose(), withRetry()
// =============================================================================
//
// Showcases the developer-experience utilities that ship with the SDK:
// prompt templates, async pipelines, concurrent mapping, and retry logic.
//
// Usage: npx tsx examples/22-dx-utilities.ts

import {
  Agent,
  template,
  summarize,
  translate,
  codeReview,
  pipe,
  mapAsync,
  compose,
  withRetry,
  retryable,
} from "gauss-ts";

async function main(): Promise<void> {
  // ── 1. Prompt Templates ────────────────────────────────────────────
  console.log("=== Prompt Templates ===\n");

  // Custom template
  const greet = template("Hello {{name}}, welcome to {{project}}!");
  console.log(greet({ name: "Alice", project: "Gauss" }));
  console.log("Variables:", greet.variables);

  // Built-in templates
  const summaryPrompt = summarize({ format: "article", style: "3 bullet points", text: "Rust is a systems programming language..." });
  console.log("\nSummarize prompt:", summaryPrompt.slice(0, 80), "...");

  const translatePrompt = translate({ language: "French", text: "Hello, world!" });
  console.log("Translate prompt:", translatePrompt);

  const reviewPrompt = codeReview({ language: "TypeScript", code: "const x: any = 42;" });
  console.log("Review prompt:", reviewPrompt.slice(0, 80), "...\n");

  // ── 2. pipe() — compose async operations ───────────────────────────
  console.log("=== pipe() ===\n");

  const result = await pipe(
    "hello world",
    (s) => s.toUpperCase(),
    (s) => `[${s}]`,
    async (s) => `Processed: ${s}`,
  );
  console.log("Pipe result:", result);

  // ── 3. mapAsync() — concurrent mapping ─────────────────────────────
  console.log("\n=== mapAsync() ===\n");

  const items = ["apple", "banana", "cherry", "date", "elderberry"];
  const mapped = await mapAsync(
    items,
    async (item, i) => `${i + 1}. ${item.toUpperCase()}`,
    { concurrency: 2 },
  );
  console.log("Mapped:", mapped);

  // ── 4. compose() — build reusable transforms ──────────────────────
  console.log("\n=== compose() ===\n");

  const enhance = compose(
    async (text: string) => text.trim(),
    async (text: string) => `[System] ${text}`,
    async (text: string) => text + " [enhanced]",
  );
  const enhanced = await enhance("  raw input  ");
  console.log("Composed:", enhanced);

  // ── 5. withRetry() — resilient operations ──────────────────────────
  console.log("\n=== withRetry() ===\n");

  let attempts = 0;
  const value = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error(`Attempt ${attempts} failed`);
      return "Success on attempt 3!";
    },
    {
      maxRetries: 5,
      backoff: "exponential",
      baseDelayMs: 100,
      onRetry: (err, attempt, delay) => {
        console.log(`  Retry ${attempt}: ${err.message} (waiting ${delay}ms)`);
      },
    },
  );
  console.log("Result:", value);

  // ── 6. retryable() — wrap an agent with retry logic ────────────────
  console.log("\n=== retryable() ===\n");

  const agent = new Agent({
    name: "resilient",
    instructions: "Answer in one sentence.",
    temperature: 0,
  });

  const resilientRun = retryable(agent, { maxRetries: 3, backoff: "exponential", baseDelayMs: 500 });

  // This wraps agent.run with automatic retry on failure
  console.log("retryable() wraps agent.run() with automatic retry logic.");
  console.log("Usage: const result = await resilientRun('prompt');");

  agent.destroy();
}

main().catch(console.error);
