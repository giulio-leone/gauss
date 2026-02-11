// =============================================================================
// 01 — Basic agent with planning (minimal setup)
// =============================================================================
//
// The simplest way to create a DeepAgent. Uses `DeepAgent.minimal()` which
// wires up an in-memory filesystem, planning tools, and sensible defaults.
//
// Usage: npx tsx examples/01-basic-agent.ts

// import { openai } from "@ai-sdk/openai";
// const model = openai("gpt-4o");

import { DeepAgent } from "@onegenui/deep-agents";
import type { DeepAgentResult } from "@onegenui/deep-agents";

// -- Placeholder model (replace with a real provider) ------------------------
const model = {} as import("ai").LanguageModel;

async function main(): Promise<void> {
  // DeepAgent.minimal() creates an agent with:
  //   - VirtualFilesystem (in-memory)
  //   - InMemoryAdapter for persistence
  //   - Planning tools (write_todos, review_todos)
  //   - ApproximateTokenCounter
  const agent = DeepAgent.minimal({
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
  const result: DeepAgentResult = await agent.run(
    "List three best practices for writing unit tests.",
  );

  // Access the final text response
  console.log("Response:", result.text);
  console.log("Steps taken:", result.steps.length);

  // Clean up event listeners and MCP connections
  await agent.dispose();
}

main().catch(console.error);
