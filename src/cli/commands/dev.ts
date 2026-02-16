// =============================================================================
// CLI Dev Command — Hot-reload dev mode with interactive REPL
// =============================================================================

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { LanguageModel } from "ai";
import { color, bold, createSpinner, formatDuration } from "../format.js";
import { AgentConfigLoader } from "../../agent/agent-config-loader.js";
import type { DeepAgent } from "../../agent/deep-agent.js";
import type { HotReloadPort } from "../../ports/hot-reload.port.js";

export async function devCommand(
  configPath: string,
  provider: string,
  apiKey: string,
  createModelFn: (provider: string, apiKey: string, model: string) => Promise<LanguageModel>,
): Promise<void> {
  // Pre-resolve initial model; cache subsequent resolutions
  let config;
  try {
    config = AgentConfigLoader.loadFile(configPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(color("red", `✗ Failed to load config: ${msg}`));
    process.exitCode = 1;
    return;
  }

  const modelCache = new Map<string, LanguageModel>();
  const initialModel = await createModelFn(provider, apiKey, config.model);
  modelCache.set(config.model, initialModel);

  const modelResolver = (modelName: string): LanguageModel => {
    const cached = modelCache.get(modelName);
    if (cached) return cached;
    // For hot-reload model changes, warn and use initial model
    console.log(color("yellow", `  ⚠ Model "${modelName}" not pre-cached, using initial model`));
    return initialModel;
  };

  let agent: DeepAgent = AgentConfigLoader.fromConfig(config, modelResolver);

  console.log(bold(color("cyan", "\n  ╔══════════════════════════════════════╗")));
  console.log(bold(color("cyan", "  ║      🔄 GaussFlow Dev Mode          ║")));
  console.log(bold(color("cyan", "  ╚══════════════════════════════════════╝")));
  console.log(color("dim", `  Agent: ${config.name} | Watching: ${configPath}`));
  console.log(color("dim", "  Config changes will hot-reload automatically."));
  console.log(color("dim", "  Type your prompt or Ctrl+C to exit.\n"));

  let watcher: HotReloadPort | undefined;
  try {
    watcher = AgentConfigLoader.watchAndReload(
      configPath,
      modelResolver,
      (newAgent) => {
        const old = agent;
        agent = newAgent;
        old.dispose().catch(() => {});
        console.log(color("yellow", `\n[hot-reload] Agent reloaded from ${configPath}\n`));
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(color("yellow", `  ⚠ File watcher unavailable: ${msg}`));
    console.log(color("dim", "  Continuing without hot-reload.\n"));
  }

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    while (true) {
      const input = await rl.question(color("green", "dev> "));
      const trimmed = input.trim();
      if (!trimmed) continue;

      const startTime = Date.now();
      const spinner = createSpinner("Thinking");

      try {
        const result = await agent.run(trimmed, {});
        spinner.stop();

        const response = result.text ?? "";
        if (response) {
          process.stdout.write(color("cyan", "\n🤖 "));
          process.stdout.write(response);
        }

        const elapsed = formatDuration(Date.now() - startTime);
        process.stdout.write(color("dim", `\n\n  ⏱ ${elapsed}\n\n`));
      } catch (err) {
        spinner.stop();
        const msg = err instanceof Error ? err.message : String(err);
        console.error(color("red", `\n✗ Error: ${msg}\n`));
      }
    }
  } catch (err: unknown) {
    const isEof =
      err instanceof Error &&
      (err.message.includes("readline was closed") ||
        (err as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE");
    if (!isEof) throw err;
  } finally {
    console.log(color("dim", "\nGoodbye! 👋\n"));
    watcher?.stop();
    rl.close();
    await agent.dispose();
  }
}
