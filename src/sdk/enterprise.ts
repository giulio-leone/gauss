import { Agent, type AgentConfig } from "./agent.js";

export interface EnterprisePresetOptions extends AgentConfig {
  retries?: number;
}

/**
 * Plug-and-play enterprise preset with production-safe defaults.
 */
export function enterprisePreset(config: EnterprisePresetOptions = {}): Agent {
  const retries = config.providerOptions?.maxRetries ?? config.retries ?? 5;

  return new Agent({
    ...config,
    name: config.name ?? "enterprise-agent",
    maxSteps: config.maxSteps ?? 20,
    temperature: config.temperature ?? 0.2,
    cacheControl: config.cacheControl ?? true,
    reasoningEffort: config.reasoningEffort ?? "medium",
    providerOptions: {
      ...config.providerOptions,
      maxRetries: retries,
    },
  });
}

/**
 * One-liner enterprise run helper.
 */
export async function enterpriseRun(
  prompt: string,
  config?: EnterprisePresetOptions
): Promise<string> {
  const agent = enterprisePreset(config);
  try {
    const result = await agent.run(prompt);
    return result.text;
  } finally {
    agent.destroy();
  }
}
