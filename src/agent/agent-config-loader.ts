// =============================================================================
// AgentConfigLoader — Load and hot-reload DeepAgent from config files
// =============================================================================

import { readFileSync } from "node:fs";
import type { LanguageModel } from "ai";
import type { AgentConfig, HotReloadPort } from "../ports/hot-reload.port.js";
import { FileWatcherAdapter } from "../adapters/hot-reload/file-watcher.adapter.js";
import { DeepAgent } from "./deep-agent.js";

export interface ModelResolver {
  (modelName: string): LanguageModel;
}

export class AgentConfigLoader {
  /**
   * Creates a DeepAgent from an AgentConfig.
   * Requires a modelResolver to convert the model string to a LanguageModel instance.
   */
  static fromConfig(config: AgentConfig, modelResolver: ModelResolver): DeepAgent {
    const builder = DeepAgent.create({
      name: config.name,
      model: modelResolver(config.model),
      instructions: config.systemPrompt || "You are a helpful assistant.",
      maxSteps: config.maxSteps,
    });

    if (config.maxSteps) builder.withMaxSteps(config.maxSteps);

    return builder.build();
  }

  /** Reads and parses a JSON config file. */
  static loadFile(path: string): AgentConfig {
    const raw = readFileSync(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    AgentConfigLoader.assertValidConfig(parsed);
    return parsed;
  }

  /**
   * Watches a config file and calls onReload with a new DeepAgent when config changes.
   * Returns the HotReloadPort so the caller can stop watching.
   */
  static watchAndReload(
    path: string,
    modelResolver: ModelResolver,
    onReload: (agent: DeepAgent) => void,
  ): HotReloadPort {
    const watcher = new FileWatcherAdapter();
    watcher.watch(path, (config) => {
      const agent = AgentConfigLoader.fromConfig(config, modelResolver);
      onReload(agent);
    });
    return watcher;
  }

  private static assertValidConfig(data: unknown): asserts data is AgentConfig {
    if (typeof data !== "object" || data === null) {
      throw new Error("Config must be a JSON object");
    }
    const obj = data as Record<string, unknown>;
    if (typeof obj.name !== "string" || obj.name.length === 0) {
      throw new Error("Config 'name' is required and must be a non-empty string");
    }
    if (typeof obj.model !== "string" || obj.model.length === 0) {
      throw new Error("Config 'model' is required and must be a non-empty string");
    }
  }
}
