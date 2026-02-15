// =============================================================================
// CLI Chat Command — Single-shot prompt execution
// =============================================================================

import type { LanguageModel } from "ai";
import { DeepAgent } from "../../agent/deep-agent.js";
import { color, createSpinner, formatDuration } from "../format.js";

export async function runChat(
  prompt: string,
  model: LanguageModel,
): Promise<void> {
  const agent = DeepAgent.create({
    model,
    instructions: "You are a helpful assistant. Answer clearly and concisely.",
  }).build();

  const startTime = Date.now();
  const spinner = createSpinner("Thinking");

  try {
    const stream = await agent.stream({
      messages: [{ role: "user", content: prompt }],
    });

    let firstChunk = true;
    for await (const chunk of stream.textStream) {
      if (firstChunk) {
        spinner.stop();
        process.stdout.write(color("cyan", "\n🤖 "));
        firstChunk = false;
      }
      process.stdout.write(chunk);
    }

    const elapsed = formatDuration(Date.now() - startTime);
    process.stdout.write(color("dim", `\n\n  ⏱ ${elapsed}\n\n`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(color("red", `\n✗ Error: ${msg}\n`));
  } finally {
    spinner.stop();
    await agent.dispose();
  }
}
