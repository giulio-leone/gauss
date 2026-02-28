// =============================================================================
// ModelRouter — Multi-provider model routing with pluggable policies
// =============================================================================

import type { LanguageModel } from "../../core/llm/index.js";

import type {
  ModelPort,
  ModelGenerateOptions,
  ModelGenerateResult,
  ModelStreamResult,
} from "../../ports/model.port.js";

// =============================================================================
// Provider descriptor
// =============================================================================

export interface ModelProviderInfo {
  /** Unique provider identifier (e.g., "openai:gpt-5.2") */
  id: string;
  /** Provider name (e.g., "openai") */
  provider: string;
  /** Model name (e.g., "gpt-5.2") */
  model: string;
  /** Cost per 1K input tokens */
  costPerInputKToken?: number;
  /** Cost per 1K output tokens */
  costPerOutputKToken?: number;
  /** Average latency in ms (tracked at runtime) */
  avgLatencyMs?: number;
  /** Context window size */
  contextWindow: number;
  /** Capabilities this model supports */
  capabilities: ModelCapability[];
  /** Whether this provider is currently healthy */
  healthy: boolean;
}

export type ModelCapability =
  | "text"
  | "vision"
  | "function-calling"
  | "json-mode"
  | "streaming"
  | "embedding"
  | "code"
  | "reasoning";

// =============================================================================
// Routing policy
// =============================================================================

export interface RoutingContext {
  /** Requested capabilities */
  requiredCapabilities?: ModelCapability[];
  /** Max acceptable latency in ms */
  maxLatencyMs?: number;
  /** Max acceptable cost per request */
  maxCostPerRequest?: number;
  /** Preferred provider (hint, not enforced) */
  preferredProvider?: string;
  /** Task complexity hint */
  complexity?: "low" | "medium" | "high";
}

export interface RoutingPolicy {
  /** Policy name */
  readonly name: string;
  /** Select the best provider given context */
  select(
    providers: readonly ModelProviderInfo[],
    context: RoutingContext,
  ): ModelProviderInfo | null;
}

// =============================================================================
// Built-in policies
// =============================================================================

export const CostOptimalPolicy: RoutingPolicy = {
  name: "cost-optimal",
  select(providers, context) {
    const eligible = filterByCapabilities(providers, context);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, p) => {
      const bestCost = (best.costPerInputKToken ?? Infinity) + (best.costPerOutputKToken ?? Infinity);
      const pCost = (p.costPerInputKToken ?? Infinity) + (p.costPerOutputKToken ?? Infinity);
      return pCost < bestCost ? p : best;
    });
  },
};

export const LatencyOptimalPolicy: RoutingPolicy = {
  name: "latency-optimal",
  select(providers, context) {
    const eligible = filterByCapabilities(providers, context);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, p) =>
      (p.avgLatencyMs ?? Infinity) < (best.avgLatencyMs ?? Infinity) ? p : best,
    );
  },
};

export const CapabilityPolicy: RoutingPolicy = {
  name: "capability",
  select(providers, context) {
    const eligible = filterByCapabilities(providers, context);
    if (eligible.length === 0) return null;
    // Prefer provider with most capabilities
    return eligible.reduce((best, p) =>
      p.capabilities.length > best.capabilities.length ? p : best,
    );
  },
};

export const FallbackPolicy: RoutingPolicy = {
  name: "fallback",
  select(providers, context) {
    const eligible = filterByCapabilities(providers, context);
    return eligible[0] ?? null;
  },
};

function filterByCapabilities(
  providers: readonly ModelProviderInfo[],
  context: RoutingContext,
): ModelProviderInfo[] {
  return providers.filter((p) => {
    if (!p.healthy) return false;
    if (context.requiredCapabilities) {
      for (const cap of context.requiredCapabilities) {
        if (!p.capabilities.includes(cap)) return false;
      }
    }
    if (context.maxLatencyMs && p.avgLatencyMs && p.avgLatencyMs > context.maxLatencyMs) {
      return false;
    }
    return true;
  });
}

// =============================================================================
// Registry entry — links info to a ModelPort adapter
// =============================================================================

interface RegisteredProvider {
  info: ModelProviderInfo;
  adapter: ModelPort;
}

// =============================================================================
// ModelRouter
// =============================================================================

export class ModelRouter implements ModelPort {
  private readonly providers = new Map<string, RegisteredProvider>();
  private policy: RoutingPolicy;
  private defaultContext: RoutingContext;
  private activeProvider: RegisteredProvider | null = null;

  constructor(policy: RoutingPolicy = FallbackPolicy, defaultContext: RoutingContext = {}) {
    this.policy = policy;
    this.defaultContext = defaultContext;
  }

  // ---------------------------------------------------------------------------
  // Provider management
  // ---------------------------------------------------------------------------

  register(info: ModelProviderInfo, adapter: ModelPort): void {
    this.providers.set(info.id, { info, adapter });
  }

  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  setPolicy(policy: RoutingPolicy): void {
    this.policy = policy;
  }

  setDefaultContext(context: RoutingContext): void {
    this.defaultContext = context;
  }

  getProviders(): readonly ModelProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => ({ ...p.info }));
  }

  // ---------------------------------------------------------------------------
  // Route selection
  // ---------------------------------------------------------------------------

  resolve(context?: RoutingContext, excludeIds?: ReadonlySet<string>): ModelPort {
    const ctx = { ...this.defaultContext, ...context };
    let infos = Array.from(this.providers.values()).map((p) => p.info);
    if (excludeIds) {
      infos = infos.filter((p) => !excludeIds.has(p.id));
    }
    const selected = this.policy.select(infos, ctx);

    if (!selected) {
      throw new Error(
        `ModelRouter: no provider matches policy "${this.policy.name}" with context ${JSON.stringify(ctx)}`,
      );
    }

    const provider = this.providers.get(selected.id)!;
    this.activeProvider = provider;
    return provider.adapter;
  }

  /** Resolve and return both adapter and provider ID (race-condition safe) */
  private resolveWithId(context?: RoutingContext, excludeIds?: ReadonlySet<string>): { adapter: ModelPort; providerId: string } {
    const ctx = { ...this.defaultContext, ...context };
    let infos = Array.from(this.providers.values()).map((p) => p.info);
    if (excludeIds) {
      infos = infos.filter((p) => !excludeIds.has(p.id));
    }
    const selected = this.policy.select(infos, ctx);

    if (!selected) {
      throw new Error(
        `ModelRouter: no provider matches policy "${this.policy.name}" with context ${JSON.stringify(ctx)}`,
      );
    }

    const provider = this.providers.get(selected.id)!;
    this.activeProvider = provider; // Keep for getActive() compatibility
    return { adapter: provider.adapter, providerId: selected.id };
  }

  // ---------------------------------------------------------------------------
  // Latency tracking — call after each request
  // ---------------------------------------------------------------------------

  recordLatency(providerId: string, latencyMs: number): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    // Exponential moving average
    const current = provider.info.avgLatencyMs ?? latencyMs;
    provider.info.avgLatencyMs = current * 0.7 + latencyMs * 0.3;
  }

  markUnhealthy(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (provider) provider.info.healthy = false;
  }

  markHealthy(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (provider) provider.info.healthy = true;
  }

  // ---------------------------------------------------------------------------
  // ModelPort delegation — routes to resolved provider
  // ---------------------------------------------------------------------------

  getModel(): LanguageModel {
    return this.getActive().getModel();
  }

  getContextWindowSize(): number {
    return this.getActive().getContextWindowSize();
  }

  getModelId(): string {
    return this.getActive().getModelId();
  }

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const failedIds = new Set<string>();
    const { adapter, providerId } = this.resolveWithId(undefined, failedIds);
    const start = Date.now();

    try {
      const result = await adapter.generate(options);
      this.recordLatency(providerId, Date.now() - start);
      return result;
    } catch (error) {
      this.markUnhealthy(providerId);
      failedIds.add(providerId);
      // Try fallback excluding already-failed providers
      try {
        const fallback = this.resolveWithId(undefined, failedIds);
        const fallbackStart = Date.now();
        const result = await fallback.adapter.generate(options);
        this.recordLatency(fallback.providerId, Date.now() - fallbackStart);
        return result;
      } catch {
        throw error; // Original error if no fallback
      }
    }
  }

  async generateStream(options: ModelGenerateOptions): Promise<ModelStreamResult> {
    const { adapter } = this.resolveWithId({ requiredCapabilities: ["streaming"] });

    if (!adapter.generateStream) {
      throw new Error("ModelRouter: selected provider does not support streaming");
    }

    return adapter.generateStream(options);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private getActive(): ModelPort {
    if (this.activeProvider) return this.activeProvider.adapter;
    return this.resolve();
  }
}
