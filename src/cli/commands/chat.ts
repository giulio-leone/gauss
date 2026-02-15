// =============================================================================
// CLI Chat Command — Single-shot prompt execution
// =============================================================================

import type { LanguageModel } from "ai";
import { DeepAgent } from "../../agent/deep-agent.js";
import { color } from "../format.js";

export async function runChat(
  prompt: string,
  model: LanguageModel,
): Promise<void> {
  const agent = DeepAgent.create({
    model,
    instructions: "You are a helpful assistant. Answer clearly and concisely.",
  }).build();

  try {
    process.stdout.write(color("cyan", "\n🤖 "));
    const stream = await agent.stream({
      messages: [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    process.stdout.write("\n\n");
  } finally {
    await agent.dispose();
  }
}
