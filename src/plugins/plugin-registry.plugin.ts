// =============================================================================
// PluginRegistryPlugin — Exposes plugin registry as agent tools
// =============================================================================

import { tool, type Tool } from "../core/llm/index.js";
import { z } from "zod";

import type { Plugin } from "../ports/plugin.port.js";
import type { PluginRegistryPort } from "../ports/plugin-registry.port.js";
import { DefaultPluginRegistryAdapter } from "../adapters/plugin-registry/default-plugin-registry.adapter.js";

export interface PluginRegistryPluginOptions {
  registry?: PluginRegistryPort;
}

export class PluginRegistryPlugin implements Plugin {
  readonly name = "plugin-registry";
  readonly version = "1.0.0";
  readonly tools: Record<string, Tool>;

  private readonly registry: PluginRegistryPort;

  constructor(options: PluginRegistryPluginOptions = {}) {
    this.registry = options.registry ?? new DefaultPluginRegistryAdapter();

    this.tools = {
      "registry:list": tool({
        description: "List all registered plugins in the marketplace.",
        inputSchema: z.object({}),
        execute: async () => {
          const manifests = this.registry.list();
          return {
            count: manifests.length,
            plugins: manifests.map((m) => ({
              name: m.name,
              version: m.version,
              description: m.description,
              author: m.author,
              tags: m.tags,
            })),
          };
        },
      }),

      "registry:search": tool({
        description: "Search plugins by keyword across name, description, and tags.",
        inputSchema: z.object({
          query: z.string().describe("Search keyword"),
        }),
        execute: async (args: unknown) => {
          const { query } = z.object({ query: z.string() }).parse(args);
          const results = this.registry.search(query);
          return {
            query,
            count: results.length,
            plugins: results.map((m) => ({
              name: m.name,
              version: m.version,
              description: m.description,
              author: m.author,
              tags: m.tags,
            })),
          };
        },
      }),

      "registry:info": tool({
        description: "Get detailed information about a registered plugin.",
        inputSchema: z.object({
          name: z.string().describe("Plugin name"),
        }),
        execute: async (args: unknown) => {
          const { name } = z.object({ name: z.string() }).parse(args);
          const manifest = this.registry.get(name);
          if (!manifest) {
            return { error: `Plugin "${name}" not found.` };
          }
          return {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            tags: manifest.tags,
            sourceType: manifest.source.type,
            dependencies: manifest.dependencies,
          };
        },
      }),

      "registry:install": tool({
        description:
          "Install and load a plugin from a local module path. " +
          "The module is dynamically imported, instantiated, and registered.",
        inputSchema: z.object({
          name: z.string().describe("Plugin name to register as"),
          modulePath: z
            .string()
            .describe("Local module path to import the plugin from"),
          exportName: z
            .string()
            .optional()
            .describe(
              "Named export to use (defaults to 'default')",
            ),
        }),
        execute: async (args: unknown) => {
          const { name, modulePath, exportName } = z
            .object({
              name: z.string(),
              modulePath: z.string(),
              exportName: z.string().optional(),
            })
            .parse(args);

          // Dynamic import and instantiate
          const mod = await import(modulePath);
          const expName = exportName ?? "default";
          const exported = mod[expName];
          if (!exported) {
            return {
              error: `Module "${modulePath}" does not export "${expName}".`,
            };
          }

          const plugin: Plugin =
            typeof exported === "function" && exported.prototype
              ? (new exported() as Plugin)
              : (exported as Plugin);

          // Register manifest
          this.registry.register({
            name,
            version: plugin.version ?? "0.0.0",
            description: `Dynamically installed from ${modulePath}`,
            source: { type: "module", modulePath, exportName },
          });

          return {
            installed: true,
            name,
            version: plugin.version ?? "0.0.0",
            tools: plugin.tools ? Object.keys(plugin.tools) : [],
          };
        },
      }),
    };
  }

  /** Expose the underlying registry for programmatic access */
  getRegistry(): PluginRegistryPort {
    return this.registry;
  }
}

/** Factory function for consistency with other plugins */
export function createPluginRegistryPlugin(
  options?: PluginRegistryPluginOptions,
): PluginRegistryPlugin {
  return new PluginRegistryPlugin(options);
}
