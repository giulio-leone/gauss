// =============================================================================
// 09 — Agent accessible via a CLI-like interface
// =============================================================================
//
// Wraps a Gauss Agent behind a simple interactive readline loop.
// Type a prompt, get a response. Type "exit" to quit.
//
// Usage: npx tsx examples/09-cli-and-rest.ts

import * as readline from "node:readline";
import { Agent } from "gauss-ai";

async function main(): Promise<void> {
  const agent = new Agent({
    name: "cli-agent",
    instructions: "You are a helpful CLI assistant. Keep answers concise.",
    maxSteps: 5,
  });

  console.log("Gauss CLI — type a prompt or 'exit' to quit.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  let running = true;
  while (running) {
    const input = await ask("You> ");
    if (!input || input.trim().toLowerCase() === "exit") {
      running = false;
      break;
    }

    try {
      const result = await agent.run(input);
      console.log(`\nAgent> ${result.text}\n`);
      console.log(`  [${result.steps} steps, ${result.inputTokens + result.outputTokens} tokens]\n`);
    } catch (err) {
      console.error("Error:", (err as Error).message);
    }
  }

  rl.close();
  agent.destroy();
  console.log("Goodbye!");
}

main().catch(console.error);
