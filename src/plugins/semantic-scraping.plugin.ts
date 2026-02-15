// =============================================================================
// SemanticScrapingPlugin — Semantic scraping & MCP manifest tools
// =============================================================================

import { tool, type Tool } from "ai";
import { z } from "zod";

import type { PluginHooks } from "../ports/plugin.port.js";
import { BasePlugin } from "./base.plugin.js";
import { SemanticScrapingAdapter } from "../adapters/semantic-scraping/index.js";
import type { ISemanticScrapingPort, SemanticTool } from "../ports/semantic-scraping.port.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SemanticScrapingPluginOptions {
  /** Custom adapter — if not provided, an in-memory adapter is created. */
  adapter?: ISemanticScrapingPort;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

const SemanticToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.union([z.string(), z.record(z.string(), z.unknown())]),
  confidence: z.number().optional(),
  category: z.string().optional(),
  annotations: z.record(z.string(), z.boolean()).optional(),
});

const ScanPageInputSchema = z.object({
  url: z.string().url().describe("The page URL that was scanned"),
  tools: z
    .array(SemanticToolSchema)
    .describe("Semantic tools extracted from the page HTML"),
});

const GetManifestInputSchema = z.object({
  origin: z.string().describe("Site origin (e.g., https://example.com)"),
});

const GetToolsForUrlInputSchema = z.object({
  origin: z.string().describe("Site origin (e.g., https://example.com)"),
  url: z.string().url().describe("The URL to get tools for"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export class SemanticScrapingPlugin extends BasePlugin {
  readonly name = "semantic-scraping";

  private readonly adapter: ISemanticScrapingPort;

  constructor(options: SemanticScrapingPluginOptions = {}) {
    super();
    this.adapter = options.adapter ?? new SemanticScrapingAdapter();
  }

  protected buildHooks(): PluginHooks {
    return {};
  }

  get tools(): Record<string, Tool> {
    const adapter = this.adapter;

    return {
      semantic_scan_page: tool({
        description:
          "Register semantic tools extracted from a web page into the site manifest",
        inputSchema: ScanPageInputSchema,
        execute: async (args) => {
          const { url, tools: rawTools } = args;
          const origin = new URL(url).origin;
          const semanticTools: SemanticTool[] = rawTools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            confidence: t.confidence,
            category: t.category,
            annotations: t.annotations,
          }));
          const manifest = adapter.updatePage(origin, url, semanticTools);
          return {
            origin,
            version: manifest.version,
            toolCount: manifest.tools.length,
            pageCount: Object.keys(manifest.pages).length,
          };
        },
      }),

      get_site_manifest: tool({
        description:
          "Get the MCP-compatible JSON manifest for a site",
        inputSchema: GetManifestInputSchema,
        execute: async (args) => {
          const { origin } = args;
          return adapter.toMCPJson(origin);
        },
      }),

      get_tools_for_url: tool({
        description:
          "Get the semantic tools available at a specific URL",
        inputSchema: GetToolsForUrlInputSchema,
        execute: async (args) => {
          const { origin, url } = args;
          return adapter.getToolsForUrl(origin, url);
        },
      }),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createSemanticScrapingPlugin(
  options: SemanticScrapingPluginOptions = {},
): SemanticScrapingPlugin {
  return new SemanticScrapingPlugin(options);
}
