// =============================================================================
// AgentConfigLoader — Load and hot-reload Agent from config files
// =============================================================================

import { readFileSync } from "node:fs";
import type { LanguageModel } from "../core/llm/index.js";
import type { HotReloadAgentConfig as AgentConfig, HotReloadPort } from "../ports/hot-reload.port.js";
import { FileWatcherAdapter } from "../adapters/hot-reload/file-watcher.adapter.js";
import { Agent } from "./agent.js";

export interface ModelResolver {
  (modelName: string): LanguageModel;
}

export class AgentConfigLoader {
  /**
   * Creates a Agent from an AgentConfig.
   * Requires a modelResolver to convert the model string to a LanguageModel instance.
   */
  static fromConfig(config: AgentConfig, modelResolver: ModelResolver): Agent {
    const builder = Agent.create({
      name: config.name,
      model: modelResolver(config.model),
      instructions: config.systemPrompt || "You are a helpful assistant.",
      maxSteps: config.maxSteps,
    });

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
   * Watches a config file and calls onReload with a new Agent when config changes.
   * Returns the HotReloadPort so the caller can stop watching.
   */
  static watchAndReload(
    path: string,
    modelResolver: ModelResolver,
    onReload: (agent: Agent) => void,
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
