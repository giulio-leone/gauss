/** Agent information returned by the API. */
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tools: ToolInfo[];
}

/** Tool metadata exposed by an agent. */
export interface ToolInfo {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
}

/** A single tool invocation record. */
export interface ToolCall {
  name: string;
  args: unknown;
  result?: unknown;
  durationMs?: number;
}

/** Chat message in a conversation. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}

/** Entry in the execution timeline. */
export interface TimelineEntry {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  label: string;
  durationMs?: number;
  timestamp: number;
}

/** SSE event from the streaming API. */
export interface PlaygroundEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  name?: string;
  args?: unknown;
  result?: unknown;
  durationMs?: number;
  message?: string;
  totalDurationMs?: number;
  tokenCount?: number;
}

/** A snapshot of an agent's memory / context window. */
export interface MemoryEntry {
  role: string;
  content: string;
  timestamp?: number;
}

/** Aggregated execution metrics. */
export interface ExecutionMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalLatencyMs: number;
  toolCallCount: number;
  estimatedCost: number;
}

/** WebSocket connection state. */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';
