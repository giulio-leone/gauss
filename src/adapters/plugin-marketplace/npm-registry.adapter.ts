// =============================================================================
// npm Registry Adapter — Discovers plugins from npm registry
// =============================================================================

import type {
  MarketplacePluginManifest,
  MarketplacePort,
} from "../../ports/plugin-manifest.port.js";
import { saveManifest, readInstalledManifests, removePluginDir } from "./local-cache.js";

const NPM_REGISTRY_URL = "https://registry.npmjs.org";

export interface NpmRegistryOptions {
  /** npm scope to search within (e.g. "@gauss") */
  scope?: string;
  /** npm registry URL override */
  registryUrl?: string;
  /** Search keyword prefix (default: "gauss-plugin") */
  keyword?: string;
}

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description: string;
      author?: { name: string } | string;
      keywords?: string[];
      links?: { npm?: string; repository?: string };
    };
  }>;
}

interface NpmPackageVersion {
  name: string;
  version: string;
  description: string;
  author?: { name: string } | string;
  keywords?: string[];
  main?: string;
  module?: string;
  gauss?: {
    entry?: string;
    tags?: string[];
  };
}

export class NpmRegistryAdapter implements MarketplacePort {
  private readonly registryUrl: string;
  private readonly scope: string | undefined;
  private readonly keyword: string;

  constructor(options?: NpmRegistryOptions) {
    this.registryUrl = options?.registryUrl ?? NPM_REGISTRY_URL;
    this.scope = options?.scope;
    this.keyword = options?.keyword ?? "gauss-plugin";
  }

  async search(query: string): Promise<MarketplacePluginManifest[]> {
    const searchTerms = this.scope
      ? `${query} scope:${this.scope}`
      : `${query} keywords:${this.keyword}`;

    const url = `${this.registryUrl}/-/v1/search?text=${encodeURIComponent(searchTerms)}&size=50`;
    const response = await this.safeFetch(url);
    let data: NpmSearchResult;
    try {
      data = (await response.json()) as NpmSearchResult;
    } catch {
      return [];
    }

    return (data.objects ?? []).map((obj) => this.toManifest(obj.package));
  }

  async getManifest(name: string): Promise<MarketplacePluginManifest | null> {
    const url = `${this.registryUrl}/${encodeURIComponent(name)}/latest`;
    let response: Response;
    try {
      response = await this.safeFetch(url);
    } catch {
      return null;
    }

    if (!response.ok) return null;

    let pkg: NpmPackageVersion;
    try {
      pkg = (await response.json()) as NpmPackageVersion;
    } catch {
      return null;
    }
    return this.toManifest(pkg);
  }

  async listInstalled(): Promise<MarketplacePluginManifest[]> {
    return readInstalledManifests();
  }

  async install(name: string): Promise<void> {
    const manifest = await this.getManifest(name);
    if (!manifest) throw new Error(`Package "${name}" not found on npm.`);
    manifest.source = "npm";
    saveManifest(manifest);
  }

  async uninstall(name: string): Promise<void> {
    removePluginDir(name);
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async safeFetch(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new Error(
        `Failed to fetch npm registry: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!response.ok) {
      throw new Error(`npm registry returned HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  }

  private toManifest(
    pkg: NpmPackageVersion | NpmSearchResult["objects"][0]["package"],
  ): MarketplacePluginManifest {
    const author =
      typeof pkg.author === "string"
        ? pkg.author
        : pkg.author?.name ?? "unknown";

    const gf = "gauss" in pkg ? (pkg as NpmPackageVersion).gauss : undefined;

    return {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description ?? "",
      author,
      entry: gf?.entry ?? ("main" in pkg ? (pkg as NpmPackageVersion).main : undefined) ?? "./index.js",
      tags: gf?.tags ?? pkg.keywords,
      source: "npm",
    };
  }
}
