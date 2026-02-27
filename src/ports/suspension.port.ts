// =============================================================================
// SuspensionPort — Persistent suspend/resume for agent execution
// =============================================================================

// =============================================================================
// Suspension state
// =============================================================================

export type SuspensionReason =
  | "awaiting_approval"
  | "awaiting_input"
  | "awaiting_external"
  | "scheduled"
  | "custom";

export interface SuspendedState {
  /** Unique suspension ID */
  id: string;
  /** Session that was suspended */
  sessionId: string;
  /** Why the agent was suspended */
  reason: SuspensionReason;
  /** Human-readable description */
  description?: string;
  /** Serialized conversation messages */
  messages: Array<{ role: string; content: string }>;
  /** Pending tool calls awaiting decisions */
  pendingToolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  /** Snapshot of agent memory at suspension time */
  memorySnapshot?: Record<string, unknown>;
  /** Plan state at suspension time */
  planSnapshot?: unknown;
  /** Custom metadata */
  metadata: Record<string, unknown>;
  /** Schema version for migration support */
  version: number;
  /** When suspended */
  suspendedAt: number;
  /** When this suspension expires (0 = never) */
  expiresAt: number;
}

// =============================================================================
// Resume decision
// =============================================================================

export interface ResumeDecision {
  /** Tool call decisions — maps toolCallId to the decision */
  toolDecisions?: Record<string, {
    action: "approve" | "reject" | "edit";
    args?: unknown;
    reason?: string;
  }>;
  /** Additional input to inject */
  input?: string;
  /** Extra metadata to merge */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Port interface
// =============================================================================

export interface SuspensionPort {
  /** Suspend an agent's execution and persist state */
  suspend(state: SuspendedState): Promise<void>;

  /** Resume a suspended execution */
  resume(suspensionId: string, decision: ResumeDecision): Promise<SuspendedState>;

  /** Get a specific suspended state */
  get(suspensionId: string): Promise<SuspendedState | null>;

  /** List all suspended states, optionally filtered by session */
  list(options?: {
    sessionId?: string;
    reason?: SuspensionReason;
    limit?: number;
    offset?: number;
  }): Promise<SuspendedState[]>;

  /** Cancel a suspension (removes it) */
  cancel(suspensionId: string): Promise<boolean>;

  /** Clean up expired suspensions */
  cleanup(): Promise<number>;
}
