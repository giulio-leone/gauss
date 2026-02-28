/**
 * Centralized model defaults for documentation and examples.
 * Update these values when new model versions are released.
 * All docs and examples reference these constants.
 */
export const models = {
  // OpenAI
  openai: {
    default: 'gpt-5.2',
    fast: 'gpt-5-mini',
    codex: 'gpt-5.2-codex',
    reasoning: 'o3',
  },
  // Anthropic
  anthropic: {
    default: 'claude-sonnet-4-20250514',
    opus: 'claude-opus-4-20250514',
    haiku: 'claude-haiku-4-20250514',
  },
  // Google
  google: {
    default: 'gemini-2.5-pro-preview-05-06',
    flash: 'gemini-2.5-flash-preview-05-20',
  },
  // Groq
  groq: {
    default: 'llama-3.3-70b-versatile',
  },
  // Mistral
  mistral: {
    default: 'mistral-large-latest',
  },
} as const

/** Shorthand model IDs for UniversalProvider format */
export const providerModels = {
  openai: `openai:${models.openai.default}`,
  anthropic: `anthropic:${models.anthropic.default}`,
  google: `google:${models.google.default}`,
  groq: `groq:${models.groq.default}`,
  mistral: `mistral:${models.mistral.default}`,
} as const
