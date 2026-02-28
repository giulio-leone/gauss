// =============================================================================
// UniversalProvider — Dynamic AI SDK provider wrapper
// Supports any @ai-sdk/* provider package with a single unified API.
// Backed by the centralized ProviderSpec registry.
// =============================================================================

import type { LanguageModel } from "../core/llm/index.js";
import { wrapV3Model } from "../core/llm/v3-adapter.js";
import {
  PROVIDER_REGISTRY,
  findByName,
  toPackageMap,
  type ProviderSpec,
} from "./registry.js";

// =============================================================================
// Types
// =============================================================================

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  [key: string]: unknown;
}

export interface UniversalProviderOptions {
  /** Custom provider packages beyond the registry */
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
      ...toPackageMap(),
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
   * const model = await provider.model('openai', 'gpt-5.2')
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
   * const model = await provider.get('openai:gpt-5.2')
   * const model2 = await provider.get('anthropic:claude-sonnet-4-20250514')
   * ```
   */
  async get(specifier: string, config?: ProviderConfig): Promise<LanguageModel> {
    const colonIdx = specifier.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(
        `Invalid specifier "${specifier}". Expected format: "provider:model" (e.g., "openai:gpt-5.2")`
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

    const spec = findByName(providerName);

    try {
      const mod = await import(pkg);

      // Use registry factoryName if available, otherwise discover dynamically
      const factoryName = spec?.factoryName;
      const createFnName = factoryName
        ? Object.keys(mod).find((k) => k === factoryName)
        : Object.keys(mod).find(
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
      const modelAccess = spec?.modelAccess ?? "direct";

      const factory = (modelId: string): LanguageModel => {
        const raw =
          modelAccess === "chat" && typeof providerInstance.chat === "function"
            ? providerInstance.chat(modelId)
            : providerInstance(modelId);
        return wrapV3Model(raw) as LanguageModel;
      };

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

/** Factory function */
export function universalProvider(
  options?: UniversalProviderOptions
): UniversalProvider {
  return new UniversalProvider(options);
}
