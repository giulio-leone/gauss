/**
 * Standalone scraping sub-path export.
 * Import as: `gauss/scraping`
 * No Node.js or AI SDK dependencies — safe for browser/extension contexts.
 */
export {
  SemanticScrapingAdapter,
  urlToPattern,
  hashTools,
} from "../adapters/semantic-scraping/index.js";

export type {
  ISemanticScrapingPort,
  SemanticTool,
  SiteToolManifest,
  PageToolSet,
  ManifestTool,
} from "../ports/semantic-scraping.port.js";
