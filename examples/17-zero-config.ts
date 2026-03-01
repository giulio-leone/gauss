// =============================================================================
// 17 — Zero-config one-liner with gauss()
// =============================================================================
//
// The simplest possible usage: a single function call.
// Auto-detects provider from environment variables.
//
// Usage:
//   export OPENAI_API_KEY=sk-...
//   npx tsx examples/17-zero-config.ts

import { gauss } from "gauss-ai";

async function main(): Promise<void> {
  // One-liner — auto-detects provider from env
  const answer = await gauss("What is the meaning of life?");
  console.log(answer);
}

main().catch(console.error);
