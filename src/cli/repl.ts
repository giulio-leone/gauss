// =============================================================================
// CLI REPL — Interactive chat mode
// =============================================================================

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { LanguageModel } from "ai";
import { DeepAgent } from "../agent/deep-agent.js";
import { createModel, getDefaultModel, isValidProvider, SUPPORTED_PROVIDERS } from "./providers.js";
import type { ProviderName } from "./providers.js";
import { resolveApiKey } from "./config.js";
import { color, bold } from "./format.js";

export async function startRepl(
  initialModel: LanguageModel,
  providerName: ProviderName,
  apiKey: string,
  modelId?: string,
): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  let currentModel = initialModel;
  let currentProvider = providerName;
  let currentModelId = modelId ?? getDefaultModel(providerName);
  let currentApiKey = apiKey;

  console.log(bold(color("cyan", "\n🤖 OneAgent Interactive REPL")));
  console.log(color("dim", `   Provider: ${currentProvider} | Model: ${currentModelId}`));
  console.log(color("dim", "   Type /help for commands, /exit to quit\n"));

  try {
    while (true) {
      const input = await rl.question(color("green", "oneagent> "));
      const trimmed = input.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("/")) {
        const handled = await handleSlashCommand(trimmed);
        if (handled === "exit") break;
        continue;
      }

      await chat(trimmed);
    }
  } catch (err: unknown) {
    const isEof =
      err instanceof Error &&
      (err.message.includes("readline was closed") ||
        (err as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE");
    if (!isEof) throw err;
    console.log(color("dim", "\nGoodbye! 👋\n"));
  } finally {
    rl.close();
  }

  async function chat(prompt: string): Promise<void> {
    const agent = DeepAgent.create({
      model: currentModel,
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(color("red", `\n✗ Error: ${msg}\n`));
    } finally {
      await agent.dispose();
    }
  }

  async function handleSlashCommand(cmd: string): Promise<string | void> {
    const parts = cmd.split(/\s+/);
    const command = parts[0]!.toLowerCase();

    switch (command) {
      case "/exit":
      case "/quit":
        console.log(color("dim", "Goodbye! 👋\n"));
        return "exit";

      case "/help":
        console.log(bold("\nAvailable commands:"));
        console.log("  /help              Show this help");
        console.log("  /exit              Exit the REPL");
        console.log("  /clear             Clear the screen");
        console.log("  /model <name>      Switch model (e.g. /model gpt-4o-mini)");
        console.log("  /provider <name>   Switch provider (openai, anthropic, google, groq, mistral)");
        console.log("  /info              Show current provider and model\n");
        break;

      case "/clear":
        process.stdout.write("\x1Bc");
        break;

      case "/info":
        console.log(color("cyan", `  Provider: ${currentProvider}`));
        console.log(color("cyan", `  Model: ${currentModelId}\n`));
        break;

      case "/model": {
        const newModel = parts[1];
        if (!newModel) {
          console.log(color("yellow", `  Current model: ${currentModelId}`));
          break;
        }
        try {
          currentModel = await createModel(currentProvider, currentApiKey, newModel);
          currentModelId = newModel;
          console.log(color("green", `  ✓ Switched to model: ${currentModelId}\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(color("red", `  ✗ Failed to switch model: ${msg}\n`));
        }
        break;
      }

      case "/provider": {
        const newProvider = parts[1];
        if (!newProvider) {
          console.log(color("yellow", `  Current provider: ${currentProvider}`));
          console.log(color("dim", `  Available: ${SUPPORTED_PROVIDERS.join(", ")}\n`));
          break;
        }
        if (!isValidProvider(newProvider)) {
          console.log(color("red", `  ✗ Unknown provider: ${newProvider}`));
          console.log(color("dim", `  Available: ${SUPPORTED_PROVIDERS.join(", ")}\n`));
          break;
        }
        const key = resolveApiKey(newProvider);
        if (!key) {
          console.log(color("red", `  ✗ No API key for ${newProvider}. Use: oneagent config set ${newProvider} <key>\n`));
          break;
        }
        try {
          const newModelId = getDefaultModel(newProvider);
          currentModel = await createModel(newProvider, key, newModelId);
          currentProvider = newProvider;
          currentModelId = newModelId;
          currentApiKey = key;
          console.log(color("green", `  ✓ Switched to ${currentProvider} (${currentModelId})\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(color("red", `  ✗ Failed to switch provider: ${msg}\n`));
        }
        break;
      }

      default:
        console.log(color("yellow", `  Unknown command: ${command}. Type /help for available commands.\n`));
    }
  }
}
