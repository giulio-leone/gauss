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
  selectedBy: "direct" | `alias:${string}`;
}

export function resolveRoutingTarget(
  policy: RoutingPolicy | undefined,
  provider: ProviderType,
  model: string,
): ResolvedRoutingTarget {
  const candidates = policy?.aliases?.[model];
  if (!candidates || candidates.length === 0) {
    return { provider, model, selectedBy: "direct" };
  }
  const selected = [...candidates].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  return {
    provider: selected.provider,
    model: selected.model,
    selectedBy: `alias:${model}`,
  };
}

