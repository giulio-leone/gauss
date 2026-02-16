// =============================================================================
// Local Plugin Cache — Helpers for managing installed plugins on disk
// =============================================================================

import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";

import type { MarketplacePluginManifest } from "../../ports/plugin-manifest.port.js";

const PLUGINS_ROOT = join(homedir(), ".gaussflow", "plugins");

/** Validates plugin name to prevent path traversal */
function assertSafeName(name: string): void {
  if (!name || /[/\\]/.test(name) || name.includes("..") || name === "." || name === "..") {
    throw new Error(`Invalid plugin name: "${name}" — must not contain path separators or traversal`);
  }
  const resolved = resolve(PLUGINS_ROOT, name);
  if (!resolved.startsWith(PLUGINS_ROOT + sep)) {
    throw new Error(`Invalid plugin name: "${name}" — path escapes plugins directory`);
  }
}

/** Returns the directory for a named plugin */
export function getPluginDir(name: string): string {
  assertSafeName(name);
  return join(PLUGINS_ROOT, name);
}

/** Writes manifest.json into the plugin directory (creates dir if needed) */
export function saveManifest(manifest: MarketplacePluginManifest): void {
  const dir = getPluginDir(manifest.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

/** Reads all installed plugin manifests from disk */
export function readInstalledManifests(): MarketplacePluginManifest[] {
  if (!existsSync(PLUGINS_ROOT)) return [];

  const entries = readdirSync(PLUGINS_ROOT, { withFileTypes: true });
  const manifests: MarketplacePluginManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(PLUGINS_ROOT, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const raw = readFileSync(manifestPath, "utf-8");
      manifests.push(JSON.parse(raw) as MarketplacePluginManifest);
    } catch {
      // skip corrupted manifests
    }
  }

  return manifests;
}

/** Removes a plugin directory entirely */
export function removePluginDir(name: string): void {
  const dir = getPluginDir(name);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
