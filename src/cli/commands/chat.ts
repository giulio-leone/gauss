// =============================================================================
// CLI Chat Command — Single-shot agentic prompt execution (streaming)
// =============================================================================

import type { LanguageModel } from "ai";
import { color, createSpinner, formatDuration } from "../format.js";
import { createCliTools } from "../tools.js";
import { detectProjectContext, contextToSystemPrompt } from "../project-context.js";

/** Max characters shown for streaming tool-input deltas */
const MAX_DELTA_DISPLAY_LENGTH = 200;
/** Max characters shown for tool output summaries */
const MAX_TOOL_OUTPUT_DISPLAY_LENGTH = 500;

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
    instructions: `You are GaussFlow, an AI coding assistant. ${contextToSystemPrompt(detectProjectContext())} You can read files, write files, search code, and execute bash commands. Use these tools to help accomplish the task. Be concise and direct.`,
    maxSteps: 15,
  })
    .withTools(tools)
    .withCostTracker(costTracker)
    .build();

  const startTime = Date.now();
  const spinner = createSpinner("Thinking");

  try {
    const stream = await agent.stream({
      messages: [{ role: "user", content: prompt }],
    });

    let firstChunk = true;
    for await (const part of stream.fullStream) {
      switch (part.type) {
        case "text-delta":
          if (firstChunk) {
            spinner.stop();
            process.stdout.write(color("cyan", "\n🤖 "));
            firstChunk = false;
          }
          process.stdout.write(part.text);
          break;
        case "tool-input-start":
          if (firstChunk) { spinner.stop(); firstChunk = false; }
          process.stdout.write(color("magenta", `\n  🔧 ${part.toolName} `));
          break;
        case "tool-input-delta":
          process.stdout.write(color("dim", part.delta.length > MAX_DELTA_DISPLAY_LENGTH ? part.delta.slice(0, MAX_DELTA_DISPLAY_LENGTH) + "…" : part.delta));
          break;
        case "tool-input-end":
          process.stdout.write("\n");
          break;
        case "tool-result":
          {
            const raw = (part as Record<string, unknown>).output ?? (part as Record<string, unknown>).result;
            const summary = typeof raw === "string" ? raw : (JSON.stringify(raw) ?? "(no output)");
            process.stdout.write(color("dim", `  ↳ ${summary.length > MAX_TOOL_OUTPUT_DISPLAY_LENGTH ? summary.slice(0, MAX_TOOL_OUTPUT_DISPLAY_LENGTH) + "…" : summary}\n`));
          }
          break;
        case "tool-error":
          process.stdout.write(color("red", `  ✗ Tool error (${(part as Record<string, unknown>).toolName}): ${(part as Record<string, unknown>).error}\n`));
          break;
        case "error":
          if (firstChunk) { spinner.stop(); firstChunk = false; }
          process.stdout.write(color("red", `\n  ✗ Stream error: ${(part as Record<string, unknown>).error}\n`));
          break;
        default:
          break;
      }
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
