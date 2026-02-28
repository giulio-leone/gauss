// =============================================================================
// UniversalProvider — Dynamic AI SDK provider wrapper
// Supports any @ai-sdk/* provider package with a single unified API.
// =============================================================================

import type { LanguageModel } from "ai";

// =============================================================================
// Types
// =============================================================================

/** Known AI SDK provider packages and their factory function names */
const KNOWN_PROVIDERS: Record<string, string> = {
  openai: "@ai-sdk/openai",
  anthropic: "@ai-sdk/anthropic",
  google: "@ai-sdk/google",
  groq: "@ai-sdk/groq",
  mistral: "@ai-sdk/mistral",
  cohere: "@ai-sdk/cohere",
  amazon: "@ai-sdk/amazon-bedrock",
  azure: "@ai-sdk/azure",
  fireworks: "@ai-sdk/fireworks",
  perplexity: "@ai-sdk/perplexity",
  togetherai: "@ai-sdk/togetherai",
  xai: "@ai-sdk/xai",
  deepinfra: "@ai-sdk/deepinfra",
  deepseek: "@ai-sdk/deepseek",
  cerebras: "@ai-sdk/cerebras",
  luma: "@ai-sdk/luma",
  fal: "@ai-sdk/fal",
  "openai-compatible": "@ai-sdk/openai-compatible",
};

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  [key: string]: unknown;
}

export interface UniversalProviderOptions {
  /** Custom provider packages beyond the known set */
  customProviders?: Record<string, string>;
  /** Default configuration for all providers */
  defaults?: ProviderConfig;
}

// =============================================================================
// UniversalProvider class
// =============================================================================

export class UniversalProvider {
  private providerCache = new Map<string, (modelId: string) => LanguageModel>();
  private providerPackages: Record<string, string>;
  private defaults: ProviderConfig;

  constructor(options: UniversalProviderOptions = {}) {
    this.providerPackages = {
      ...KNOWN_PROVIDERS,
      ...options.customProviders,
    };
    this.defaults = options.defaults ?? {};
  }

  /**
   * Get a language model from any supported provider.
   *
   * @example
   * ```ts
   * const provider = new UniversalProvider()
   * const model = await provider.model('openai', 'gpt-4o')
   * const model2 = await provider.model('anthropic', 'claude-sonnet-4-20250514')
   * ```
   */
  async model(
    providerName: string,
    modelId: string,
    config?: ProviderConfig
  ): Promise<LanguageModel> {
    const factory = await this.getFactory(providerName);
    return factory(modelId);
  }

  /**
   * Shorthand: "provider:model" format
   *
   * @example
   * ```ts
   * const model = await provider.get('openai:gpt-4o')
   * const model2 = await provider.get('anthropic:claude-sonnet-4-20250514')
   * ```
   */
  async get(specifier: string, config?: ProviderConfig): Promise<LanguageModel> {
    const colonIdx = specifier.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(
        `Invalid specifier "${specifier}". Expected format: "provider:model" (e.g., "openai:gpt-4o")`
      );
    }
    const providerName = specifier.slice(0, colonIdx);
    const modelId = specifier.slice(colonIdx + 1);
    return this.model(providerName, modelId, config);
  }

  /** List all known provider names */
  listProviders(): string[] {
    return Object.keys(this.providerPackages);
  }

  /** Check if a provider package is installed */
  async isAvailable(providerName: string): Promise<boolean> {
    const pkg = this.providerPackages[providerName];
    if (!pkg) return false;
    try {
      await import(pkg);
      return true;
    } catch {
      return false;
    }
  }

  /** Discover all installed providers */
  async discoverInstalled(): Promise<string[]> {
    const results: string[] = [];
    for (const name of Object.keys(this.providerPackages)) {
      if (await this.isAvailable(name)) {
        results.push(name);
      }
    }
    return results;
  }

  private async getFactory(
    providerName: string
  ): Promise<(modelId: string) => LanguageModel> {
    const cached = this.providerCache.get(providerName);
    if (cached) return cached;

    const pkg = this.providerPackages[providerName];
    if (!pkg) {
      throw new Error(
        `Unknown provider "${providerName}". Known: ${Object.keys(this.providerPackages).join(", ")}`
      );
    }

    try {
      const mod = await import(pkg);
      // AI SDK convention: create<Provider> function or default export
      // Try multiple naming patterns to handle e.g. createOpenAI vs createOpenai
      const createFnName = Object.keys(mod).find(
        (k) => k.toLowerCase() === `create${providerName.toLowerCase()}`
      );
      const createFn =
        (createFnName ? mod[createFnName] : undefined) ??
        mod.default ??
        mod[providerName];

      if (typeof createFn !== "function") {
        throw new Error(
          `Provider package "${pkg}" does not export a factory function`
        );
      }

      const providerInstance = createFn(this.defaults);
      const factory = (modelId: string) => providerInstance(modelId) as LanguageModel;
      this.providerCache.set(providerName, factory);
      return factory;
    } catch (err) {
      if ((err as Error).message?.includes("Cannot find")) {
        throw new Error(
          `Provider "${providerName}" requires package "${pkg}". Install with: npm install ${pkg}`
        );
      }
      throw err;
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Factory function */
export function universalProvider(
  options?: UniversalProviderOptions
): UniversalProvider {
  return new UniversalProvider(options);
}
