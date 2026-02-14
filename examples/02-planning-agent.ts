// =============================================================================
// 02 — Agent with filesystem, planning, and event monitoring
// =============================================================================
//
// Uses the builder pattern to compose an agent with a VirtualFilesystem,
// planning tools, and event listeners for observability.
//
// Usage: npx tsx examples/02-planning-agent.ts

// import { openai } from "@ai-sdk/openai";
// const model = openai("gpt-4o");

import {
  DeepAgent,
  VirtualFilesystem,
} from "@onegenui/agent";
import type { AgentEvent } from "@onegenui/agent";

const model = {} as import("ai").LanguageModel;

async function main(): Promise<void> {
  const fs = new VirtualFilesystem();

  // Builder pattern: chain capabilities onto the agent
  const agent = DeepAgent.create({
    model,
    instructions: [
      "You are a project scaffolding assistant.",
      "Use the filesystem to create files.",
      "Plan your work with todos before writing code.",
    ].join("\n"),
    maxSteps: 25,
  })
    .withFilesystem(fs)
    .withPlanning()

    // -- Event listeners for progress tracking --------------------------------
    .on("agent:start", (e: AgentEvent) => {
      console.log(`[start] session=${e.sessionId}`);
    })
    .on("step:end", (e: AgentEvent) => {
      const data = e.data as { stepIndex: number };
      console.log(`[step] ${data.stepIndex} completed`);
    })
    .on("tool:call", (e: AgentEvent) => {
      const data = e.data as { toolName: string };
      console.log(`[tool] calling ${data.toolName}`);
    })
    .on("planning:update", (e: AgentEvent) => {
      console.log("[plan] todos updated:", e.data);
    })
    .on("error", (e: AgentEvent) => {
      console.error("[error]", e.data);
    })
    .build();

  // Run a multi-step task
  const result = await agent.run(
    "Create a TypeScript project with src/index.ts and a tsconfig.json. "
    + "Add a hello-world function that returns a greeting string.",
  );

  console.log("Final output:", result.text);

  // Inspect files created by the agent
  const files = await fs.list("/", { recursive: true });
  console.log("Files created:", files.map((f) => f.path));

  await agent.dispose();
}

main().catch(console.error);
