// =============================================================================
// @onegenui/agent — Shared Type Definitions
// =============================================================================

import type { LanguageModel } from "ai";

// =============================================================================
// Agent Configuration
// =============================================================================

export interface DeepAgentConfig {
  /** Agent identifier */
  id?: string;
  /** Display name */
  name?: string;
  /** System instructions for the agent */
  instructions: string;
  /** AI model to use */
  model: LanguageModel;
  /** Maximum steps before stopping */
  maxSteps?: number;
  /** Context window configuration */
  context?: ContextConfig;
  /** Human-in-the-loop configuration */
  approval?: ApprovalConfig;
  /** Subagent configuration */
  subagent?: SubagentConfig;
  /** Checkpoint configuration */
  checkpoint?: CheckpointConfig;
}

export interface ContextConfig {
  /** Threshold (0-1) to trigger rolling summarization. Default: 0.70 */
  summarizationThreshold?: number;
  /** Threshold (0-1) to trigger truncation. Default: 0.85 */
  truncationThreshold?: number;
  /** Token count above which tool results are offloaded to VFS. Default: 20000 */
  offloadTokenThreshold?: number;
  /** Model to use for summarization (cheap model). Default: same as agent model */
  summarizationModel?: LanguageModel | null;
  /** Number of recent messages to preserve during summarization */
  preserveRecentMessages?: number;
}

export interface ApprovalConfig {
  /** Default approval mode. Default: "approve-all" */
  defaultMode?: "approve-all" | "deny-all";
  /** Tools that require approval (deny-list when defaultMode is "approve-all") */
  requireApproval?: string[];
  /** Tools that are auto-approved (allow-list when defaultMode is "deny-all") */
  autoApprove?: string[];
  /** Callback invoked when approval is required */
  onApprovalRequired?: (request: ApprovalRequest) => Promise<boolean>;
}

export interface SubagentConfig {
  /** Maximum depth of nested subagents. Default: 3 */
  maxDepth?: number;
  /** Timeout for subagent execution in ms. Default: 300000 (5 min) */
  timeoutMs?: number;
  /** Whether subagents can spawn their own subagents. Default: true */
  allowNesting?: boolean;
}

export interface CheckpointConfig {
  /** Enable checkpointing. Default: true */
  enabled?: boolean;
  /** Base step interval between checkpoints. Default: 5 */
  baseStepInterval?: number;
  /** Maximum checkpoints to retain. Default: 10 */
  maxCheckpoints?: number;
}

// =============================================================================
// Approval
// =============================================================================

export interface ApprovalRequest {
  toolName: string;
  toolCallId: string;
  args: unknown;
  sessionId: string;
  stepIndex: number;
}

// =============================================================================
// Agent Events
// =============================================================================

export type AgentEventType =
  | "agent:start"
  | "agent:stop"
  | "step:start"
  | "step:end"
  | "tool:call"
  | "tool:result"
  | "tool:approval-required"
  | "tool:approved"
  | "tool:denied"
  | "checkpoint:save"
  | "checkpoint:load"
  | "context:summarize"
  | "context:offload"
  | "context:truncate"
  | "subagent:spawn"
  | "subagent:complete"
  | "planning:update"
  | "error"
  | "graph:start"
  | "graph:complete"
  | "node:start"
  | "node:complete"
  | "consensus:start"
  | "consensus:result"
  | "fork:start"
  | "fork:complete";

export interface AgentEvent<T = unknown> {
  type: AgentEventType;
  timestamp: number;
  sessionId: string;
  data: T;
}

export type AgentEventHandler = (event: AgentEvent) => void;

// =============================================================================
// File System
// =============================================================================

export type FilesystemZone = "transient" | "persistent";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  createdAt: number;
  modifiedAt: number;
}

export interface ListOptions {
  recursive?: boolean;
  includeHidden?: boolean;
  maxDepth?: number;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  maxResults?: number;
  includeLineNumbers?: boolean;
  filePattern?: string;
}

export interface SearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

// =============================================================================
// Messages & Conversation
// =============================================================================

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface CompressedContext {
  summary: string;
  originalMessageCount: number;
  compressedAt: number;
}

// =============================================================================
// Session
// =============================================================================

export interface SessionState {
  sessionId: string;
  startedAt: number;
  lastActivityAt: number;
  stepCount: number;
  totalTokensUsed: number;
  status: "active" | "paused" | "completed" | "failed";
}
