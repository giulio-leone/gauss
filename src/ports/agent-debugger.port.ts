// =============================================================================
// AgentDebuggerPort — Time-travel debugger for agent execution
// =============================================================================

// =============================================================================
// Debug State — Snapshot of agent state at a given point in time
// =============================================================================

export interface DebugState {
  messages: unknown[];
  toolCalls: { name: string; args: unknown; result?: unknown }[];
  tokenCount: number;
  costEstimate: number;
  elapsedMs: number;
  metadata: Record<string, unknown>;
}

// =============================================================================
// Debug Checkpoint — Single recorded point during execution
// =============================================================================

export interface DebugCheckpoint {
  index: number;
  timestamp: number;
  type:
    | "agent_start"
    | "tool_call"
    | "tool_result"
    | "llm_request"
    | "llm_response"
    | "agent_end"
    | "error";
  data: Record<string, unknown>;
  state: DebugState;
}

// =============================================================================
// Breakpoints — Conditional pause points
// =============================================================================

export interface BreakpointCondition {
  type:
    | "tool_call"
    | "token_threshold"
    | "cost_threshold"
    | "step_count"
    | "custom";
  toolName?: string;
  threshold?: number;
  predicate?: (checkpoint: DebugCheckpoint) => boolean;
}

export interface BreakpointHit {
  breakpointId: string;
  condition: BreakpointCondition;
  checkpoint: DebugCheckpoint;
}

// =============================================================================
// Diff — Comparison between sessions or checkpoint arrays
// =============================================================================

export interface DebugDiff {
  checkpointIndex: number;
  field: string;
  left: unknown;
  right: unknown;
  type: "added" | "removed" | "changed";
}

// =============================================================================
// Debug Session — Navigable recording of an agent run
// =============================================================================

export interface DebugSession {
  readonly id: string;
  readonly agentId: string;
  readonly prompt: string;
  readonly checkpoints: DebugCheckpoint[];

  /** Navigate to a specific checkpoint */
  goto(index: number): DebugCheckpoint;

  /** Step forward one checkpoint */
  stepForward(): DebugCheckpoint | null;

  /** Step backward one checkpoint */
  stepBackward(): DebugCheckpoint | null;

  /** Get current checkpoint index */
  currentIndex(): number;

  /** Branch from current checkpoint with modified state */
  branch(modifications: Partial<DebugCheckpoint>): DebugSession;

  /** Add a breakpoint */
  addBreakpoint(condition: BreakpointCondition): string;

  /** Remove a breakpoint */
  removeBreakpoint(id: string): void;

  /** Check if any breakpoint matches the current state */
  checkBreakpoints(checkpoint: DebugCheckpoint): BreakpointHit | null;

  /** Compare two sessions or checkpoint arrays */
  diff(other: DebugSession | DebugCheckpoint[]): DebugDiff[];

  /** Export session for sharing */
  serialize(): string;
}

// =============================================================================
// Session Summary — Lightweight overview for listing
// =============================================================================

export interface DebugSessionSummary {
  id: string;
  agentId: string;
  prompt: string;
  checkpointCount: number;
  totalTokens: number;
  totalCost: number;
  durationMs: number;
  createdAt: number;
}

// =============================================================================
// Agent Debugger Port — Top-level debugger contract
// =============================================================================

export interface AgentDebuggerPort {
  /** Start a debug session for an agent run */
  startSession(agentId: string, prompt: string): DebugSession;

  /** List all recorded sessions */
  listSessions(): DebugSessionSummary[];

  /** Load a recorded session for replay */
  loadSession(sessionId: string): DebugSession;
}
