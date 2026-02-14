// =============================================================================
// 05 — Agent with Supabase persistence and checkpointing
// =============================================================================
//
// Demonstrates durable memory: todos, conversation history, and checkpoints
// are persisted to Supabase. The agent can resume from the last checkpoint
// if interrupted.
//
// Requires: @supabase/supabase-js
// Usage:    npx tsx examples/05-persistent-memory.ts

// import { openai } from "@ai-sdk/openai";
// const model = openai("gpt-4o");

import { DeepAgent, SupabaseMemoryAdapter } from "@onegenui/agent";
import type { CheckpointConfig } from "@onegenui/agent";

const model = {} as import("ai").LanguageModel;

async function main(): Promise<void> {
  // -- Supabase setup ---------------------------------------------------------
  // Tables required: deep_agent_todos, deep_agent_checkpoints,
  //                  deep_agent_conversations, deep_agent_metadata
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL ?? "https://your-project.supabase.co",
    process.env.SUPABASE_KEY ?? "your-anon-key",
  );

  const memory = new SupabaseMemoryAdapter(supabase, { strict: false });

  // -- Checkpoint configuration -----------------------------------------------
  const checkpoint: CheckpointConfig = {
    enabled: true,
    baseStepInterval: 5,    // save every 5 steps
    maxCheckpoints: 10,     // keep last 10 checkpoints
  };

  // -- Build agent with persistent memory ------------------------------------
  const agent = DeepAgent.create({
    model,
    id: "session-abc-123",  // fixed ID allows resuming later
    instructions: "You are a research assistant. Take notes as you work.",
    maxSteps: 20,
    checkpoint,
  })
    .withMemory(memory)
    .withPlanning()
    .on("checkpoint:save", (e) => {
      console.log("[checkpoint] saved at step", e.data);
    })
    .on("checkpoint:load", (e) => {
      console.log("[checkpoint] resumed from", e.data);
    })
    .build();

  // First run — creates checkpoint
  const result = await agent.run("Research the history of the Turing Award.");
  console.log("Result:", result.text);

  // Later: a new agent with the same session ID resumes from checkpoint
  const resumed = DeepAgent.create({
    model,
    id: "session-abc-123",
    instructions: "You are a research assistant. Continue your prior work.",
    maxSteps: 20,
    checkpoint,
  })
    .withMemory(memory)
    .withPlanning()
    .build();

  const continuation = await resumed.run("Expand on the most recent winners.");
  console.log("Continuation:", continuation.text);

  await agent.dispose();
  await resumed.dispose();
}

main().catch(console.error);
