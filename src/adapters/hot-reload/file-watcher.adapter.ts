// =============================================================================
// FileWatcherAdapter — Watches JSON config files for hot-reload
// =============================================================================

import { readFileSync, watch, type FSWatcher } from "node:fs";
import type { HotReloadPort, AgentConfig } from "../../ports/hot-reload.port.js";

function validateAgentConfig(data: unknown): data is AgentConfig {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.length === 0) return false;
  if (typeof obj.model !== "string" || obj.model.length === 0) return false;
  if (obj.systemPrompt !== undefined && typeof obj.systemPrompt !== "string") return false;
  if (obj.maxSteps !== undefined && typeof obj.maxSteps !== "number") return false;
  return true;
}

export class FileWatcherAdapter implements HotReloadPort {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  watch(configPath: string, onChange: (config: AgentConfig) => void): void {
    this.stop();

    try {
      this.watcher = watch(configPath, () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          try {
            const raw = readFileSync(configPath, "utf-8");
            const parsed: unknown = JSON.parse(raw);
            if (!validateAgentConfig(parsed)) {
              console.warn(`[hot-reload] Invalid config shape in ${configPath}`);
              return;
            }
            onChange(parsed);
          } catch (err) {
            console.warn(`[hot-reload] Failed to read/parse ${configPath}:`, err);
          }
        }, this.debounceMs);
      });
    } catch (err) {
      console.warn(`[hot-reload] Failed to watch ${configPath}:`, err);
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
