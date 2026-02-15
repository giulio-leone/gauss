// =============================================================================
// BasePlugin — Abstract base class for DeepAgent plugins
// =============================================================================

import type { DeepAgentPlugin, PluginHooks } from "../ports/plugin.port.js";

export abstract class BasePlugin implements DeepAgentPlugin {
  abstract readonly name: string;
  readonly version = "1.0.0";
  readonly hooks: PluginHooks;

  constructor() {
    this.hooks = this.buildHooks();
  }

  protected abstract buildHooks(): PluginHooks;
}
