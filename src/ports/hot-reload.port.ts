// =============================================================================
// HotReload Port — Contract for watching agent config changes
// =============================================================================

export interface HotReloadPort {
  watch(configPath: string, onChange: (config: AgentConfig) => void): void;
  stop(): void;
}

export interface AgentConfig {
  name: string;
  model: string;
  systemPrompt?: string;
  maxSteps?: number;
}
