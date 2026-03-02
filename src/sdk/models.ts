/**
 * Model Constants — Single Source of Truth
 *
 * Update these when new model versions are released.
 * All examples, tests, and defaults reference this file.
 */

// ─── OpenAI ──────────────────────────────────────────
export const OPENAI_DEFAULT = "gpt-5.2";
export const OPENAI_FAST = "gpt-4.1";
export const OPENAI_REASONING = "o4-mini";
export const OPENAI_IMAGE = "gpt-image-1";

// ─── Anthropic ───────────────────────────────────────
export const ANTHROPIC_DEFAULT = "claude-sonnet-4-20250514";
export const ANTHROPIC_FAST = "claude-haiku-4-20250414";
export const ANTHROPIC_PREMIUM = "claude-opus-4-20250414";

// ─── Google ──────────────────────────────────────────
export const GOOGLE_DEFAULT = "gemini-2.5-flash";
export const GOOGLE_PREMIUM = "gemini-2.5-pro";
export const GOOGLE_IMAGE = "gemini-2.0-flash";

// ─── OpenRouter ──────────────────────────────────────
export const OPENROUTER_DEFAULT = "openai/gpt-5.2";

// ─── DeepSeek ────────────────────────────────────────
export const DEEPSEEK_DEFAULT = "deepseek-chat";
export const DEEPSEEK_REASONING = "deepseek-reasoner";

// ─── Enterprise OpenAI-Compatible Providers ─────────
export const TOGETHER_DEFAULT = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
export const FIREWORKS_DEFAULT = "accounts/fireworks/models/llama-v3p1-70b-instruct";
export const MISTRAL_DEFAULT = "mistral-large-latest";
export const PERPLEXITY_DEFAULT = "sonar-pro";
export const XAI_DEFAULT = "grok-3-beta";

// ─── Provider Defaults Map ───────────────────────────
export const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: OPENAI_DEFAULT,
  anthropic: ANTHROPIC_DEFAULT,
  google: GOOGLE_DEFAULT,
  openrouter: OPENROUTER_DEFAULT,
  deepseek: DEEPSEEK_DEFAULT,
  groq: "llama-3.3-70b-versatile",
  ollama: "llama3.2",
  together: TOGETHER_DEFAULT,
  fireworks: FIREWORKS_DEFAULT,
  mistral: MISTRAL_DEFAULT,
  perplexity: PERPLEXITY_DEFAULT,
  xai: XAI_DEFAULT,
};

/** Get the default model for a provider */
export function defaultModel(provider: string): string {
  return PROVIDER_DEFAULTS[provider] ?? OPENAI_DEFAULT;
}
