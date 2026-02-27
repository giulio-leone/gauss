// =============================================================================
// Agent Configuration — Defaults and builder
// =============================================================================

import type {
  ContextConfig,
  ApprovalConfig,
  SubagentConfig,
  CheckpointConfig,
} from "../types.js";

export interface ResolvedSubagentConfig {
  maxDepth: number;
  timeoutMs: number;
  allowNesting: boolean;
  hooks?: SubagentConfig["hooks"];
}

export const DEFAULT_CONTEXT_CONFIG: Required<ContextConfig> = {
  summarizationThreshold: 0.7,
  truncationThreshold: 0.85,
  offloadTokenThreshold: 20_000,
  summarizationModel: null, // Falls back to agent model at runtime
  preserveRecentMessages: 10,
};

export const DEFAULT_APPROVAL_CONFIG: Required<ApprovalConfig> = {
  defaultMode: "approve-all",
  requireApproval: [],
  autoApprove: [],
  onApprovalRequired: async () => true,
};

/** Subagent execution timeout in ms (5 minutes) */
const DEFAULT_SUBAGENT_TIMEOUT_MS = 300_000;

export const DEFAULT_SUBAGENT_CONFIG: ResolvedSubagentConfig = {
  maxDepth: 3,
  timeoutMs: DEFAULT_SUBAGENT_TIMEOUT_MS,
  allowNesting: true,
};

export const DEFAULT_CHECKPOINT_CONFIG: Required<CheckpointConfig> = {
  enabled: true,
  baseStepInterval: 5,
  maxCheckpoints: 10,
};

export function resolveContextConfig(
  partial?: ContextConfig,
): Required<ContextConfig> {
  if (!partial) return { ...DEFAULT_CONTEXT_CONFIG };
  return { ...DEFAULT_CONTEXT_CONFIG, ...partial };
}

export function resolveApprovalConfig(
  partial?: ApprovalConfig,
): Required<ApprovalConfig> {
  if (!partial) return { ...DEFAULT_APPROVAL_CONFIG };
  return { ...DEFAULT_APPROVAL_CONFIG, ...partial };
}

export function resolveSubagentConfig(
  partial?: SubagentConfig,
): ResolvedSubagentConfig {
  if (!partial) return { ...DEFAULT_SUBAGENT_CONFIG };
  return { ...DEFAULT_SUBAGENT_CONFIG, ...partial };
}

export function resolveCheckpointConfig(
  partial?: CheckpointConfig,
): Required<CheckpointConfig> {
  if (!partial) return { ...DEFAULT_CHECKPOINT_CONFIG };
  return { ...DEFAULT_CHECKPOINT_CONFIG, ...partial };
}
