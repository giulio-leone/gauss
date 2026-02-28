// =============================================================================
// CLI Providers — Dynamic provider factory (lazy-loaded peer deps)
// =============================================================================

import type { LanguageModel } from "../core/llm/index.js";

export const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "groq",
  "mistral",
  "openrouter",
] as const;

export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: "gpt-5.2",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.5-flash-preview-05-20",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  openrouter: "openai/gpt-5.2",
};

export function isValidProvider(name: string): name is ProviderName {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(name);
}

export function getDefaultModel(provider: ProviderName): string {
  return DEFAULT_MODELS[provider];
}

export async function createModel(
  provider: ProviderName,
  apiKey: string,
  modelId?: string,
): Promise<LanguageModel> {
  const model = modelId ?? DEFAULT_MODELS[provider];

  switch (provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey })(model);
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey })(model);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey })(model);
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      return createGroq({ apiKey })(model);
    }
    case "mistral": {
      const { createMistral } = await import("@ai-sdk/mistral");
      return createMistral({ apiKey })(model);
    }
    case "openrouter": {
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      return createOpenRouter({ apiKey })(model);
    }
  }
}
