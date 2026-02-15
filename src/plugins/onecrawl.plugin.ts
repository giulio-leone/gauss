// =============================================================================
// OneCrawlPlugin — Web scraping and search tools via onecrawl
// =============================================================================

import { tool, type Tool } from "ai";
import { z } from "zod";

import type { PluginHooks } from "../ports/plugin.port.js";
import { BasePlugin } from "./base.plugin.js";
import type { ValidationPort } from "../ports/validation.port.js";
import { ZodValidationAdapter } from "../adapters/validation/zod-validation.adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OneCrawlPluginOptions {
  /** onecrawl Crawler instance — if not provided, one will be created lazily */
  crawler?: unknown;
  /** Maximum content length per scraped page (default: 10000) */
  maxContentLength?: number;
  /** Timeout per request in ms (default: 30000) */
  timeout?: number;
  /** Validation adapter (defaults to ZodValidationAdapter) */
  validator?: ValidationPort;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export class OneCrawlPlugin extends BasePlugin {
  readonly name = "crawl";

  private readonly options: OneCrawlPluginOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private crawlerPromise: Promise<any> | null = null;
  private readonly validator: ValidationPort;

  constructor(options: OneCrawlPluginOptions = {}) {
    super();
    this.options = options;
    this.validator = options.validator ?? new ZodValidationAdapter();
  }

  protected buildHooks(): PluginHooks {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getCrawler(): Promise<any> {
    if (!this.crawlerPromise) {
      this.crawlerPromise = this.initCrawler();
    }
    return this.crawlerPromise;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async initCrawler(): Promise<any> {
    if (this.options.crawler) {
      return this.options.crawler;
    }
    try {
      // @ts-expect-error — onecrawl is an optional peer dependency
      const mod = await import("onecrawl");
      const CrawlerClass = mod.Crawler ?? mod.default?.Crawler ?? mod.default;
      return new CrawlerClass({
        timeout: this.options.timeout ?? 30000,
      });
    } catch {
      throw new Error(
        'OneCrawlPlugin requires "onecrawl" package. Install it: pnpm add onecrawl',
      );
    }
  }

  get tools(): Record<string, Tool> {
    const maxLen = this.options.maxContentLength ?? 10000;
    const getCrawler = this.getCrawler.bind(this);
    const validator = this.validator;

    return {
      scrape: tool({
        description: "Scrape a web page and extract its text content",
        inputSchema: z.object({
          url: z.string().url().describe("The URL to scrape"),
        }),
        execute: async (args: unknown) => {
          const { url } = validator.validateOrThrow<{ url: string }>(
            z.object({ url: z.string().url() }),
            args,
          );
          const crawler = await getCrawler();
          const result = await crawler.crawl(url);
          const content =
            typeof result === "string"
              ? result
              : (result?.content ?? result?.text ?? JSON.stringify(result));
          return content.length > maxLen
            ? content.slice(0, maxLen) + "\n...[truncated]"
            : content;
        },
      }),

      search: tool({
        description: "Search the web and return results",
        inputSchema: z.object({
          query: z.string().describe("The search query"),
          limit: z.number().min(1).max(20).default(5).describe("Max results to return"),
        }),
        execute: async (args: unknown) => {
          const { query, limit } = validator.validateOrThrow<{ query: string; limit: number }>(
            z.object({
              query: z.string(),
              limit: z.number().min(1).max(20).default(5),
            }),
            args,
          );
          const crawler = await getCrawler();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results = await crawler.search(query, { limit });
          if (Array.isArray(results)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return results.map((r: any) => ({
              title: r.title ?? "",
              url: r.url ?? r.link ?? "",
              snippet: r.snippet ?? r.description ?? "",
            }));
          }
          return results;
        },
      }),

      batch: tool({
        description: "Scrape multiple web pages in parallel",
        inputSchema: z.object({
          urls: z.array(z.string().url()).min(1).max(10).describe("URLs to scrape"),
        }),
        execute: async (args: unknown) => {
          const { urls } = validator.validateOrThrow<{ urls: string[] }>(
            z.object({ urls: z.array(z.string().url()).min(1).max(10) }),
            args,
          );
          const crawler = await getCrawler();
          if (typeof crawler.batchCrawl === "function") {
            const results = await crawler.batchCrawl(urls);
            return Array.isArray(results)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? results.map((r: any, i: number) => ({
                  url: urls[i],
                  content: (
                    typeof r === "string" ? r : (r?.content ?? r?.text ?? "")
                  ).slice(0, maxLen),
                }))
              : results;
          }
          // Fallback: parallel crawl
          const results = await Promise.all(
            urls.map(async (u: string) => {
              try {
                const r = await crawler.crawl(u);
                const content =
                  typeof r === "string" ? r : (r?.content ?? r?.text ?? "");
                return { url: u, content: content.slice(0, maxLen) };
              } catch (error) {
                return { url: u, error: String(error) };
              }
            }),
          );
          return results;
        },
      }),
    };
  }

  async dispose(): Promise<void> {
    if (this.crawlerPromise) {
      try {
        const crawler = await this.crawlerPromise;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (crawler as any).close === "function") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (crawler as any).close();
        }
      } catch {
        // Ignore errors during cleanup
      }
      this.crawlerPromise = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createOneCrawlPlugin(
  options: OneCrawlPluginOptions = {},
): OneCrawlPlugin {
  return new OneCrawlPlugin(options);
}
