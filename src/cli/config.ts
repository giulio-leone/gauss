// =============================================================================
// CLI Config — .gaussrc file management
// =============================================================================

import { readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { McpServerConfig } from "../ports/mcp.port.js";

const CONFIG_FILE = ".gaussrc";

/** Maximum number of history lines to retain on disk */
const MAX_HISTORY_LINES = 1000;

export interface GaussConfig {
  keys: Record<string, string>;
  defaultProvider?: string;
  defaultModel?: string;
  mcpServers?: McpServerConfig[];
}

function configPath(): string {
  return join(homedir(), CONFIG_FILE);
}

export function loadConfig(): GaussConfig {
  const path = configPath();
  if (!existsSync(path)) return { keys: {} };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<GaussConfig>;
    return {
      keys: parsed.keys ?? {},
      defaultProvider: parsed.defaultProvider,
      defaultModel: parsed.defaultModel,
      mcpServers: parsed.mcpServers,
    };
  } catch {
    console.error("Warning: ~/.gaussrc is corrupted or unreadable. Using empty config.");
    return { keys: {} };
  }
}

export function saveConfig(config: GaussConfig): void {
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

export function getMcpServers(): McpServerConfig[] {
  return loadConfig().mcpServers ?? [];
}

export function addMcpServer(config: McpServerConfig): void {
  const cfg = loadConfig();
  cfg.mcpServers = (cfg.mcpServers ?? []).filter((s) => s.id !== config.id);
  cfg.mcpServers.push(config);
  saveConfig(cfg);
}

export function removeMcpServer(serverId: string): boolean {
  const cfg = loadConfig();
  const servers = cfg.mcpServers ?? [];
  const filtered = servers.filter((s) => s.id !== serverId);
  if (filtered.length === servers.length) return false;
  cfg.mcpServers = filtered;
  saveConfig(cfg);
  return true;
}

// =============================================================================
// Persistent REPL History
// =============================================================================

const HISTORY_FILE = ".gauss_history";

function historyPath(): string {
  return join(homedir(), HISTORY_FILE);
}

export function loadHistory(): string[] {
  const path = historyPath();
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
    if (lines.length > MAX_HISTORY_LINES) {
      const trimmed = lines.slice(-MAX_HISTORY_LINES);
      writeFileSync(path, trimmed.join("\n") + "\n", { encoding: "utf-8", mode: 0o600 });
      chmodSync(path, 0o600);
      return trimmed;
    }
    return lines;
  } catch {
    return [];
  }
}

let historyPermsFixed = false;

export function appendHistory(line: string): void {
  try {
    const path = historyPath();
    appendFileSync(path, line + "\n", { encoding: "utf-8", mode: 0o600 });
    if (!historyPermsFixed) {
      chmodSync(path, 0o600);
      historyPermsFixed = true;
    }
  } catch {
    // Silently fail
  }
}
