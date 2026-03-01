/**
 * Gauss SDK — Shared types.
 *
 * Design principles:
 *  - Every option has a sensible default
 *  - Minimal required fields — only what's truly mandatory
 *  - String unions over enums for JS-friendliness
 *  - Record<string, unknown> for extensibility
 */

// ─── Provider ──────────────────────────────────────────────────────

export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "ollama"
  | "deepseek";

export interface ProviderOptions {
  /** API key. Auto-resolved from environment if omitted. */
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  organization?: string;
}

// ─── Messages ──────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: MessageRole;
  content: string;
}

/** @deprecated Use `Message` instead. */
export type JsMessage = Message;

// ─── Tools ─────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export type ToolExecutor = (callJson: string) => Promise<string>;
export type StreamCallback = (eventJson: string) => void;

// ─── Agent ─────────────────────────────────────────────────────────

export interface AgentOptions {
  instructions?: string;
  maxSteps?: number;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  seed?: number;
  stopOnTool?: string;
  outputSchema?: Record<string, unknown>;
}

/** A citation reference from document-aware responses. */
export interface Citation {
  /** Citation type: char_location, page_location, content_block_location. */
  type: string;
  /** The cited text from the document. */
  citedText?: string;
  /** Title of the source document. */
  documentTitle?: string;
  /** Start index (character, page, or block depending on type). */
  start?: number;
  /** End index (character, page, or block depending on type). */
  end?: number;
}

export interface AgentResult {
  text: string;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  structuredOutput?: Record<string, unknown>;
  /** Extended thinking output (Anthropic). */
  thinking?: string;
  /** Citations from document-aware responses (Anthropic). */
  citations?: Citation[];
}

// ─── Memory ────────────────────────────────────────────────────────

export type MemoryEntryType = "conversation" | "fact" | "preference" | "task" | "summary";
export type MemoryTier = "core" | "active" | "background" | "archive";

export interface MemoryEntry {
  id: string;
  content: string;
  entryType: MemoryEntryType;
  timestamp: string;
  tier?: MemoryTier;
  metadata?: Record<string, unknown>;
  importance?: number;
  sessionId?: string;
  embedding?: number[];
}

export interface RecallOptions {
  sessionId?: string;
  limit?: number;
}

export interface MemoryStats {
  totalEntries: number;
  [key: string]: unknown;
}

// ─── RAG / Vector Store ────────────────────────────────────────────

export interface VectorChunk {
  id: string;
  documentId: string;
  content: string;
  index: number;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// ─── Guardrails ────────────────────────────────────────────────────

export type PiiAction = "block" | "warn" | "redact";

// ─── Tool Validator ────────────────────────────────────────────────

export type CoercionStrategy =
  | "null_to_default"
  | "type_cast"
  | "json_parse"
  | "strip_null";

// ─── Eval ──────────────────────────────────────────────────────────

export type EvalScorerType = "exact_match" | "contains" | "length_ratio";

// ─── Core ──────────────────────────────────────────────────────────

/** Opaque handle returned by NAPI resource constructors. */
export type Handle = number;

/** Any SDK resource that owns native memory. */
export interface Disposable {
  destroy(): void;
}

// ─── Environment helpers ───────────────────────────────────────────

const ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  ollama: "",
};

/** Resolve an API key from environment for the given provider. */
export function resolveApiKey(provider: ProviderType): string {
  const key = ENV_KEYS[provider] ?? "";
  if (!key) return ""; // ollama doesn't need a key
  return (typeof process !== "undefined" ? process.env[key] : "") ?? "";
}

/** Auto-detect the best available provider from environment variables. */
export function detectProvider(): { provider: ProviderType; model: string } | undefined {
  const checks: Array<{ env: string; provider: ProviderType; model: string }> = [
    { env: "OPENAI_API_KEY", provider: "openai", model: "gpt-4o" },
    { env: "ANTHROPIC_API_KEY", provider: "anthropic", model: "claude-sonnet-4-20250514" },
    { env: "GOOGLE_API_KEY", provider: "google", model: "gemini-2.0-flash" },
    { env: "GROQ_API_KEY", provider: "groq", model: "llama-3.3-70b-versatile" },
    { env: "DEEPSEEK_API_KEY", provider: "deepseek", model: "deepseek-chat" },
  ];
  for (const { env, provider, model } of checks) {
    if (typeof process !== "undefined" && process.env[env]) {
      return { provider, model };
    }
  }
  return undefined;
}
