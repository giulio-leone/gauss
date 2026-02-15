// =============================================================================
// CLI Config — .oneagentrc file management
// =============================================================================

import { readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILE = ".oneagentrc";

export interface OneAgentConfig {
  keys: Record<string, string>;
}

function configPath(): string {
  return join(homedir(), CONFIG_FILE);
}

export function loadConfig(): OneAgentConfig {
  const path = configPath();
  if (!existsSync(path)) return { keys: {} };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<OneAgentConfig>;
    return { keys: parsed.keys ?? {} };
  } catch {
    return { keys: {} };
  }
}

export function saveConfig(config: OneAgentConfig): void {
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
};

export function envVarName(provider: string): string {
  return ENV_MAP[provider] ?? "";
}

export function resolveApiKey(provider: string, cliKey?: string): string | undefined {
  return cliKey ?? getKey(provider) ?? process.env[ENV_MAP[provider] ?? ""];
}
