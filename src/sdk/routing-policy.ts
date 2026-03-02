import type { ProviderType } from "./types.js";

export interface RoutingCandidate {
  provider: ProviderType;
  model: string;
  priority?: number;
  maxCostUsd?: number;
}

export interface RoutingPolicy {
  aliases?: Record<string, RoutingCandidate[]>;
  fallbackOrder?: ProviderType[];
  maxTotalCostUsd?: number;
}

export interface ResolvedRoutingTarget {
  provider: ProviderType;
  model: string;
  selectedBy: "direct" | `alias:${string}` | `fallback:${ProviderType}`;
}

export interface ResolveRoutingTargetOptions {
  availableProviders?: ProviderType[];
  estimatedCostUsd?: number;
}

export function enforceRoutingCostLimit(
  policy: RoutingPolicy | undefined,
  costUsd: number,
): void {
  if (policy?.maxTotalCostUsd !== undefined && costUsd > policy.maxTotalCostUsd) {
    throw new Error(`routing policy rejected cost ${costUsd}`);
  }
}

export function resolveFallbackProvider(
  policy: RoutingPolicy | undefined,
  availableProviders: ProviderType[],
): ProviderType | null {
  const order = policy?.fallbackOrder;
  if (!order || order.length === 0 || availableProviders.length === 0) {
    return null;
  }
  const available = new Set(availableProviders);
  for (const candidate of order) {
    if (available.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveRoutingTarget(
  policy: RoutingPolicy | undefined,
  provider: ProviderType,
  model: string,
  options: ResolveRoutingTargetOptions = {},
): ResolvedRoutingTarget {
  if (options.estimatedCostUsd !== undefined) {
    enforceRoutingCostLimit(policy, options.estimatedCostUsd);
  }

  const candidates = policy?.aliases?.[model];
  if (candidates && candidates.length > 0) {
    const selected = [...candidates].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
    return {
      provider: selected.provider,
      model: selected.model,
      selectedBy: `alias:${model}`,
    };
  }

  const fallback = resolveFallbackProvider(policy, options.availableProviders ?? []);
  if (fallback && fallback !== provider) {
    return { provider: fallback, model, selectedBy: `fallback:${fallback}` };
  }

  return { provider, model, selectedBy: "direct" };
}
