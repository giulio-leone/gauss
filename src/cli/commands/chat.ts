// =============================================================================
// CLI Chat Command — Single-shot agentic prompt execution
// =============================================================================

import type { LanguageModel } from "ai";
import { color, createSpinner, formatDuration, formatMarkdown } from "../format.js";
import { createCliTools } from "../tools.js";

/** Max characters shown for tool call arguments in console output */
const MAX_ARGS_DISPLAY_LENGTH = 200;
/** Max characters shown for tool results in console output */
const MAX_RESULT_DISPLAY_LENGTH = 500;

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
            console.log(color("dim", `     ${argsStr.length > MAX_ARGS_DISPLAY_LENGTH ? argsStr.slice(0, MAX_ARGS_DISPLAY_LENGTH - 3) + "..." : argsStr}`));
          }
        }
        if (step.toolResults) {
          for (const tr of step.toolResults) {
            const resStr = typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result);
            const truncated = resStr.length > MAX_RESULT_DISPLAY_LENGTH ? resStr.slice(0, MAX_RESULT_DISPLAY_LENGTH - 3) + "..." : resStr;
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
    // fire-and-forget: usage persistence must not block exit
    await persistUsage(costTracker).catch((err: unknown) => {
      console.warn("[usage] Failed to persist usage data:", err instanceof Error ? err.message : String(err));
    });
    await agent.dispose();
  }
}
