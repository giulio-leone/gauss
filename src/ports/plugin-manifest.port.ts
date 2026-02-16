// =============================================================================
// Plugin Manifest Port — Contract for plugin marketplace
// =============================================================================

/** Manifest describing a marketplace plugin */
export interface MarketplacePluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  entry: string;
  dependencies?: Record<string, string>;
  tags?: string[];
  license?: string;
}

/** Port for discovering, installing, and managing marketplace plugins */
export interface MarketplacePort {
  search(query: string): Promise<MarketplacePluginManifest[]>;
  getManifest(name: string): Promise<MarketplacePluginManifest | null>;
  listInstalled(): Promise<MarketplacePluginManifest[]>;
  install(name: string): Promise<void>;
  uninstall(name: string): Promise<void>;
}
