// =============================================================================
// CLI Chat Command — Single-shot agentic prompt execution
// =============================================================================

import type { LanguageModel } from "ai";
import { color, createSpinner, formatDuration, formatMarkdown } from "../format.js";
import { createCliTools } from "../tools.js";

export async function runChat(
  prompt: string,
  model: LanguageModel,
  yolo = false,
): Promise<void> {
  const tools = createCliTools({
    yolo,
    confirm: async (desc: string) => {
      if (!process.stdin.isTTY) {
        console.log(color("red", `  ✗ Blocked: ${desc} (use --yolo to auto-approve)`));
        return false;
      }
      // Interactive: ask user
      const { createInterface } = await import("node:readline/promises");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question(color("yellow", `  ⚠ ${desc} — Execute? (y/n) `));
        return answer.toLowerCase().startsWith("y");
      } finally {
        rl.close();
      }
    },
  });

  const { DeepAgent } = await import("../../agent/deep-agent.js");
  const { DefaultCostTrackerAdapter } = await import("../../adapters/cost-tracker/index.js");
  const { persistUsage } = await import("../persist-usage.js");
  const costTracker = new DefaultCostTrackerAdapter();
  const agent = DeepAgent.create({
    model,
    instructions: "You are GaussFlow, an AI coding assistant. You can read files, write files, search code, and execute bash commands. Use these tools to help accomplish the task. Be concise and direct.",
    maxSteps: 15,
  })
    .withTools(tools)
    .withCostTracker(costTracker)
    .build();

  const startTime = Date.now();
  const spinner = createSpinner("Thinking");

  try {
    const result = await agent.run(prompt, {});

    spinner.stop();

    // Display tool calls
    const steps = result.steps as Array<{
      toolCalls?: Array<{ toolName: string; args: unknown }>;
      toolResults?: Array<{ toolName: string; result: unknown }>;
    }>;
    if (steps) {
      for (const step of steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            console.log(color("magenta", `\n  🔧 ${tc.toolName}`));
            const argsStr = JSON.stringify(tc.args);
            console.log(color("dim", `     ${argsStr.length > 200 ? argsStr.slice(0, 197) + "..." : argsStr}`));
          }
        }
        if (step.toolResults) {
          for (const tr of step.toolResults) {
            const resStr = typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result);
            const truncated = resStr.length > 500 ? resStr.slice(0, 497) + "..." : resStr;
            console.log(color("dim", `     → ${truncated}`));
          }
        }
      }
    }

    // Display response
    const response = result.text ?? "";
    if (response) {
      process.stdout.write(color("cyan", "\n🤖 "));
      process.stdout.write(formatMarkdown(response));
    }

    const elapsed = formatDuration(Date.now() - startTime);
    process.stdout.write(color("dim", `\n\n  ⏱ ${elapsed}\n\n`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(color("red", `\n✗ Error: ${msg}\n`));
  } finally {
    spinner.stop();
    await persistUsage(costTracker).catch(() => {});
    await agent.dispose();
  }
}
