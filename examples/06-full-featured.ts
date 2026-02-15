// 06 — Full-featured agent with all capabilities
// Combines filesystem, planning, subagents, MCP, memory, approval, and events.
// Usage: npx tsx examples/06-full-featured.ts

// import { openai } from "@ai-sdk/openai";
// const model = openai("gpt-4o");

import {
  DeepAgent, LocalFilesystem, SupabaseMemoryAdapter, AiSdkMcpAdapter,
} from "@giulio-leone/gaussflow-agent";
import type { AgentEvent, ApprovalRequest } from "@giulio-leone/gaussflow-agent";

const model = {} as import("ai").LanguageModel;

async function main(): Promise<void> {
  const fs = new LocalFilesystem("/tmp/deep-agent-workspace");

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL ?? "https://your-project.supabase.co",
    process.env.SUPABASE_KEY ?? "your-anon-key",
  );
  const memory = new SupabaseMemoryAdapter(supabase);

  const mcp = new AiSdkMcpAdapter({
    servers: [{
      id: "tools", name: "Custom Tools", transport: "stdio",
      command: "node", args: ["my-mcp-server.js"],
    }],
  });

  // Build with filesystem, memory, MCP, planning, subagents, and approval
  const agent = DeepAgent.create({
    model,
    instructions: [
      "You are a senior engineer working on a real codebase.",
      "Plan work with todos. Delegate subtasks to subagents.",
      "Write files to the local filesystem. Use MCP tools as needed.",
      "Destructive operations (delete, overwrite) require approval.",
    ].join("\n"),
    maxSteps: 50,
    checkpoint: { enabled: true, baseStepInterval: 5, maxCheckpoints: 10 },
  })
    .withFilesystem(fs)
    .withMemory(memory)
    .withMcp(mcp)
    .withPlanning()
    .withSubagents({ maxDepth: 2, timeoutMs: 180_000 })
    .withApproval({
      defaultMode: "approve-all",
      requireApproval: ["write_file", "edit_file"],
      onApprovalRequired: async (req: ApprovalRequest): Promise<boolean> => {
        console.log(`[approval] ${req.toolName} — auto-approving`);
        return true;
      },
    })
    .on("*", (e: AgentEvent) => {
      console.log(`[${e.type}] ${JSON.stringify(e.data).slice(0, 120)}`);
    })
    .build();

  const result = await agent.run(
    "Scaffold a Node.js CLI tool called 'quicknote' with package.json, "
    + "src/index.ts, src/commands/add.ts, src/commands/list.ts, and README.md. "
    + "Delegate the README writing to a subagent.",
  );

  console.log("Done:", result.text);
  console.log("Session:", result.sessionId, "| Steps:", result.steps.length);
  await agent.dispose();
}

main().catch(console.error);
