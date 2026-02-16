// =============================================================================
// GitHub Registry Adapter — Fetches plugin manifests from a GitHub-hosted registry
// =============================================================================

import type {
  MarketplacePluginManifest,
  MarketplacePort,
} from "../../ports/plugin-manifest.port.js";
import {
  saveManifest,
  readInstalledManifests,
  removePluginDir,
} from "./local-cache.js";

const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/giulio-leone/gaussflow-plugins/main/registry.json";

export interface GitHubRegistryOptions {
  registryUrl?: string;
}

export class GitHubRegistryAdapter implements MarketplacePort {
  private readonly registryUrl: string;

  constructor(options?: GitHubRegistryOptions) {
    this.registryUrl = options?.registryUrl ?? DEFAULT_REGISTRY_URL;
  }

  async search(query: string): Promise<MarketplacePluginManifest[]> {
    const manifests = await this.fetchRegistry();
    const lower = query.toLowerCase();
    return manifests.filter(
      (m) =>
        m.name.toLowerCase().includes(lower) ||
        m.description.toLowerCase().includes(lower) ||
        m.tags?.some((t) => t.toLowerCase().includes(lower)),
    );
  }

  async getManifest(name: string): Promise<MarketplacePluginManifest | null> {
    const manifests = await this.fetchRegistry();
    return manifests.find((m) => m.name === name) ?? null;
  }

  async listInstalled(): Promise<MarketplacePluginManifest[]> {
    return readInstalledManifests();
  }

  async install(name: string): Promise<void> {
    const manifest = await this.getManifest(name);
    if (!manifest) {
      throw new Error(`Plugin "${name}" not found in registry.`);
    }
    saveManifest(manifest);
  }

  async uninstall(name: string): Promise<void> {
    removePluginDir(name);
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async fetchRegistry(): Promise<MarketplacePluginManifest[]> {
    let response: Response;
    try {
      response = await fetch(this.registryUrl);
    } catch (err) {
      throw new Error(
        `Failed to fetch plugin registry: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Registry returned HTTP ${response.status}: ${response.statusText}`,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("Registry returned invalid JSON.");
    }

    if (!Array.isArray(data)) {
      throw new Error("Registry JSON is not an array.");
    }

    return data as MarketplacePluginManifest[];
  }
}
