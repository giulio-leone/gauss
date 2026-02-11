// =============================================================================
// 03 — Parent agent that spawns specialized subagents
// =============================================================================
//
// Demonstrates hierarchical agent orchestration. The parent agent can delegate
// subtasks to child agents via the `task` tool, with configurable depth limits
// and timeouts.
//
// Usage: npx tsx examples/03-subagent-orchestration.ts

// import { openai } from "@ai-sdk/openai";
// const model = openai("gpt-4o");

import { DeepAgent } from "@onegenui/deep-agents";
import type { AgentEvent, SubagentConfig } from "@onegenui/deep-agents";

const model = {} as import("ai").LanguageModel;

async function main(): Promise<void> {
  const subagentConfig: Partial<SubagentConfig> = {
    maxDepth: 2,              // subagents can nest up to 2 levels
    timeoutMs: 120_000,       // 2 minute timeout per subagent
    allowNesting: true,       // subagents may spawn their own children
  };

  const agent = DeepAgent.create({
    model,
    instructions: [
      "You are a lead engineer that decomposes complex tasks.",
      "Use the `task` tool to delegate subtasks to specialized subagents.",
      "Each subagent receives its own instructions and works independently.",
      "Synthesize all subagent results into a final answer.",
    ].join("\n"),
    maxSteps: 30,
  })
    .withPlanning()
    .withSubagents(subagentConfig)

    // Monitor subagent lifecycle
    .on("subagent:spawn", (e: AgentEvent) => {
      const data = e.data as { taskDescription: string };
      console.log(`[subagent] spawned: ${data.taskDescription}`);
    })
    .on("subagent:complete", (e: AgentEvent) => {
      const data = e.data as { taskDescription: string };
      console.log(`[subagent] done: ${data.taskDescription}`);
    })
    .build();

  // The agent will decompose this into smaller subtasks
  const result = await agent.run(
    "Build a REST API design for a todo application. "
    + "One subagent should design the data model, another should "
    + "define the endpoints, and a third should write example requests.",
  );

  console.log("Final design:", result.text);
  console.log("Total steps:", result.steps.length);

  await agent.dispose();
}

main().catch(console.error);
