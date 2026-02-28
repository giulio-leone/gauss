// =============================================================================
// 01 — Basic agent with planning (minimal setup)
// =============================================================================
//
// The simplest way to create a Agent. Uses `Agent.minimal()` which
// wires up an in-memory filesystem, planning tools, and sensible defaults.
//
// Usage: npx tsx examples/01-basic-agent.ts

// import { openai } from "@ai-sdk/openai";
// const model = openai("gpt-5.2");

import { Agent } from "gauss";
import type { AgentResult } from "gauss";

// -- Placeholder model (replace with a real provider) ------------------------
const model = {} as import("ai").LanguageModel;

async function main(): Promise<void> {
  // Agent.minimal() creates an agent with:
  //   - VirtualFilesystem (in-memory)
  //   - InMemoryAdapter for persistence
  //   - Planning tools (write_todos, review_todos)
  //   - ApproximateTokenCounter
  const agent = Agent.minimal({
    model,
    instructions: [
      "You are a helpful coding assistant.",
      "Break tasks into todos before starting work.",
      "Mark each todo done as you complete it.",
    ].join("\n"),
    maxSteps: 15,
  });

  console.log(`Session: ${agent.sessionId}`);

  // Run the agent with a simple prompt
  const result: AgentResult = await agent.run(
    "List three best practices for writing unit tests.",
  );

  // Access the final text response
  console.log("Response:", result.text);
  console.log("Steps taken:", result.steps.length);

  // Clean up event listeners and MCP connections
  await agent.dispose();
}

main().catch(console.error);
