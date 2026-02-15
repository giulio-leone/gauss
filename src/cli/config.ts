// =============================================================================
// CLI Config — .gaussflowrc file management
// =============================================================================

import { readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILE = ".gaussflowrc";

export interface GaussFlowConfig {
  keys: Record<string, string>;
  defaultProvider?: string;
  defaultModel?: string;
}

function configPath(): string {
  return join(homedir(), CONFIG_FILE);
}

export function loadConfig(): GaussFlowConfig {
  const path = configPath();
  if (!existsSync(path)) return { keys: {} };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<GaussFlowConfig>;
    return {
      keys: parsed.keys ?? {},
      defaultProvider: parsed.defaultProvider,
      defaultModel: parsed.defaultModel,
    };
  } catch {
    return { keys: {} };
  }
}

export function saveConfig(config: GaussFlowConfig): void {
  const path = configPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

export function setKey(provider: string, apiKey: string): void {
  const config = loadConfig();
  config.keys[provider] = apiKey;
  saveConfig(config);
}

export function getKey(provider: string): string | undefined {
  return loadConfig().keys[provider];
}

export function deleteKey(provider: string): boolean {
  const config = loadConfig();
  if (!(provider in config.keys)) return false;
  delete config.keys[provider];
  saveConfig(config);
  return true;
}

export function listKeys(): Record<string, string> {
  return loadConfig().keys;
}

// Environment variable fallback mapping
export const ENV_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function envVarName(provider: string): string {
  return ENV_MAP[provider] ?? "";
}

export function resolveApiKey(provider: string, cliKey?: string): string | undefined {
  return cliKey ?? getKey(provider) ?? process.env[ENV_MAP[provider] ?? ""];
}

export function setDefaultProvider(provider: string): void {
  const config = loadConfig();
  config.defaultProvider = provider;
  saveConfig(config);
}

export function setDefaultModel(model: string): void {
  const config = loadConfig();
  config.defaultModel = model;
  saveConfig(config);
}

export function getDefaultProvider(): string | undefined {
  return loadConfig().defaultProvider;
}

export function getDefaultModelFromConfig(): string | undefined {
  return loadConfig().defaultModel;
}
