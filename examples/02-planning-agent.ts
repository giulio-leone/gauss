// =============================================================================
// 02 — Planning Agent with tools and a JS-side tool executor
// =============================================================================
//
// Shows how to define tools and provide a JavaScript executor so the agent
// can call Node.js functions during its planning loop.
//
// Usage: npx tsx examples/02-planning-agent.ts

import { Agent } from "gauss-ai";
import type { ToolDef } from "gauss-ai";

// ── Tool definitions ─────────────────────────────────────────────────
const tools: ToolDef[] = [
  {
    name: "list_tasks",
    description: "List current project tasks",
    parameters: { status: { type: "string", enum: ["todo", "done", "all"] } },
  },
  {
    name: "add_task",
    description: "Add a new task to the project board",
    parameters: {
      title: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
    },
  },
];

// ── In-memory task store (simulates a real backend) ──────────────────
const tasks: Array<{ title: string; priority: string; done: boolean }> = [
  { title: "Set up CI/CD", priority: "high", done: false },
  { title: "Write README", priority: "medium", done: true },
];

// ── Tool executor — receives JSON, returns JSON ──────────────────────
async function toolExecutor(callJson: string): Promise<string> {
  const { name, arguments: args } = JSON.parse(callJson);
  switch (name) {
    case "list_tasks": {
      const status = args?.status ?? "all";
      const filtered = status === "all" ? tasks : tasks.filter((t) => (status === "done" ? t.done : !t.done));
      return JSON.stringify(filtered);
    }
    case "add_task": {
      tasks.push({ title: args.title, priority: args.priority ?? "medium", done: false });
      return JSON.stringify({ ok: true, total: tasks.length });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

async function main(): Promise<void> {
  const agent = new Agent({
    name: "planner",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You are a project planning assistant. Use tools to manage tasks.",
    tools,
    maxSteps: 10,
  });

  // runWithTools passes tool calls to our JS executor
  const result = await agent.runWithTools(
    "List all current tasks, then add a new high-priority task: 'Implement auth'. Finally summarize the board.",
    toolExecutor,
  );

  console.log("Plan:", result.text);
  console.log("Tasks in store:", tasks);

  agent.destroy();
}

main().catch(console.error);
