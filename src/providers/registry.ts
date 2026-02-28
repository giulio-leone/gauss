// =============================================================================
// gauss/providers/registry — Centralized Provider Specification Registry
// =============================================================================
//
// Single source of truth for all supported AI SDK provider packages.
// Used by UniversalProvider, gauss() factory, and env auto-detection.
//
// =============================================================================

/**
 * Describes how a provider instance exposes model creation.
 *
 * - `"direct"` — call `provider(modelId)` to get a model
 * - `"chat"` — call `provider.chat(modelId)` for the Chat Completions API
 */
export type ModelAccess = "direct" | "chat";

/**
 * Specification for a single AI SDK provider.
 * Captures everything needed to dynamically load, configure, and use a provider.
 */
export interface ProviderSpec {
  /** Unique provider identifier (e.g., "openai", "anthropic") */
  readonly name: string;
  /** npm package name (e.g., "@ai-sdk/openai") */
  readonly package: string;
  /** Environment variable for the API key (undefined if none required) */
  readonly envKey?: string;
  /** Default model ID when none specified */
  readonly defaultModel: string;
  /** Factory export name inside the package (e.g., "createOpenAI") */
  readonly factoryName: string;
  /** How to obtain a model from the provider instance */
  readonly modelAccess: ModelAccess;
  /** Human-readable display name */
  readonly displayName: string;
  /** Provider category for grouping */
  readonly category: ProviderCategory;
}

/**
 * Provider categories for organization and discovery.
 */
export type ProviderCategory =
  | "cloud"
  | "open-source"
  | "inference"
  | "speech"
  | "media"
  | "routing"
  | "compatible";

// =============================================================================
// Provider Registry — 30+ entries
// =============================================================================

export const PROVIDER_REGISTRY: readonly ProviderSpec[] = [
  // ─── Cloud Providers ──────────────────────────────────────────────────────
  {
    name: "openai",
    package: "@ai-sdk/openai",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    factoryName: "createOpenAI",
    modelAccess: "chat",
    displayName: "OpenAI",
    category: "cloud",
  },
  {
    name: "anthropic",
    package: "@ai-sdk/anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-20250514",
    factoryName: "createAnthropic",
    modelAccess: "direct",
    displayName: "Anthropic",
    category: "cloud",
  },
  {
    name: "google",
    package: "@ai-sdk/google",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    defaultModel: "gemini-2.5-flash-preview-05-20",
    factoryName: "createGoogleGenerativeAI",
    modelAccess: "direct",
    displayName: "Google AI",
    category: "cloud",
  },
  {
    name: "google-vertex",
    package: "@ai-sdk/google-vertex",
    envKey: "GOOGLE_VERTEX_PROJECT",
    defaultModel: "gemini-2.5-flash-preview-05-20",
    factoryName: "createVertex",
    modelAccess: "direct",
    displayName: "Google Vertex AI",
    category: "cloud",
  },
  {
    name: "azure",
    package: "@ai-sdk/azure",
    envKey: "AZURE_API_KEY",
    defaultModel: "gpt-4o-mini",
    factoryName: "createAzure",
    modelAccess: "direct",
    displayName: "Azure OpenAI",
    category: "cloud",
  },
  {
    name: "amazon",
    package: "@ai-sdk/amazon-bedrock",
    envKey: "AWS_ACCESS_KEY_ID",
    defaultModel: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    factoryName: "createAmazonBedrock",
    modelAccess: "direct",
    displayName: "Amazon Bedrock",
    category: "cloud",
  },

  // ─── Inference Providers ──────────────────────────────────────────────────
  {
    name: "groq",
    package: "@ai-sdk/groq",
    envKey: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    factoryName: "createGroq",
    modelAccess: "direct",
    displayName: "Groq",
    category: "inference",
  },
  {
    name: "fireworks",
    package: "@ai-sdk/fireworks",
    envKey: "FIREWORKS_API_KEY",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    factoryName: "createFireworks",
    modelAccess: "direct",
    displayName: "Fireworks AI",
    category: "inference",
  },
  {
    name: "togetherai",
    package: "@ai-sdk/togetherai",
    envKey: "TOGETHER_AI_API_KEY",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    factoryName: "createTogetherAI",
    modelAccess: "direct",
    displayName: "Together AI",
    category: "inference",
  },
  {
    name: "deepinfra",
    package: "@ai-sdk/deepinfra",
    envKey: "DEEPINFRA_API_KEY",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    factoryName: "createDeepInfra",
    modelAccess: "direct",
    displayName: "DeepInfra",
    category: "inference",
  },
  {
    name: "cerebras",
    package: "@ai-sdk/cerebras",
    envKey: "CEREBRAS_API_KEY",
    defaultModel: "llama-3.3-70b",
    factoryName: "createCerebras",
    modelAccess: "direct",
    displayName: "Cerebras",
    category: "inference",
  },
  {
    name: "sambanova",
    package: "@ai-sdk/sambanova",
    envKey: "SAMBANOVA_API_KEY",
    defaultModel: "Meta-Llama-3.1-70B-Instruct",
    factoryName: "createSambaNova",
    modelAccess: "direct",
    displayName: "SambaNova",
    category: "inference",
  },
  {
    name: "baseten",
    package: "@ai-sdk/baseten",
    envKey: "BASETEN_API_KEY",
    defaultModel: "llama-3.1-70b-instruct",
    factoryName: "createBaseten",
    modelAccess: "direct",
    displayName: "Baseten",
    category: "inference",
  },
  {
    name: "nebius",
    package: "@ai-sdk/nebius",
    envKey: "NEBIUS_API_KEY",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    factoryName: "createNebius",
    modelAccess: "direct",
    displayName: "Nebius",
    category: "inference",
  },
  {
    name: "replicate",
    package: "@ai-sdk/replicate",
    envKey: "REPLICATE_API_TOKEN",
    defaultModel: "meta/meta-llama-3-70b-instruct",
    factoryName: "createReplicate",
    modelAccess: "direct",
    displayName: "Replicate",
    category: "inference",
  },

  // ─── Open-Source / Self-Hosted ────────────────────────────────────────────
  {
    name: "mistral",
    package: "@ai-sdk/mistral",
    envKey: "MISTRAL_API_KEY",
    defaultModel: "mistral-large-latest",
    factoryName: "createMistral",
    modelAccess: "direct",
    displayName: "Mistral",
    category: "open-source",
  },
  {
    name: "cohere",
    package: "@ai-sdk/cohere",
    envKey: "COHERE_API_KEY",
    defaultModel: "command-r-plus",
    factoryName: "createCohere",
    modelAccess: "direct",
    displayName: "Cohere",
    category: "open-source",
  },
  {
    name: "xai",
    package: "@ai-sdk/xai",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-2",
    factoryName: "createXai",
    modelAccess: "direct",
    displayName: "xAI (Grok)",
    category: "open-source",
  },
  {
    name: "deepseek",
    package: "@ai-sdk/deepseek",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    factoryName: "createDeepSeek",
    modelAccess: "direct",
    displayName: "DeepSeek",
    category: "open-source",
  },
  {
    name: "perplexity",
    package: "@ai-sdk/perplexity",
    envKey: "PERPLEXITY_API_KEY",
    defaultModel: "sonar-pro",
    factoryName: "createPerplexity",
    modelAccess: "direct",
    displayName: "Perplexity",
    category: "open-source",
  },

  // ─── Speech / Audio Providers ─────────────────────────────────────────────
  {
    name: "elevenlabs",
    package: "@ai-sdk/elevenlabs",
    envKey: "ELEVENLABS_API_KEY",
    defaultModel: "eleven_multilingual_v2",
    factoryName: "createElevenLabs",
    modelAccess: "direct",
    displayName: "ElevenLabs",
    category: "speech",
  },
  {
    name: "lmnt",
    package: "@ai-sdk/lmnt",
    envKey: "LMNT_API_KEY",
    defaultModel: "aurora",
    factoryName: "createLMNT",
    modelAccess: "direct",
    displayName: "LMNT",
    category: "speech",
  },
  {
    name: "hume",
    package: "@ai-sdk/hume",
    envKey: "HUME_API_KEY",
    defaultModel: "evi-2",
    factoryName: "createHume",
    modelAccess: "direct",
    displayName: "Hume",
    category: "speech",
  },
  {
    name: "deepgram",
    package: "@ai-sdk/deepgram",
    envKey: "DEEPGRAM_API_KEY",
    defaultModel: "nova-2",
    factoryName: "createDeepgram",
    modelAccess: "direct",
    displayName: "Deepgram",
    category: "speech",
  },
  {
    name: "assemblyai",
    package: "@ai-sdk/assemblyai",
    envKey: "ASSEMBLYAI_API_KEY",
    defaultModel: "best",
    factoryName: "createAssemblyAI",
    modelAccess: "direct",
    displayName: "AssemblyAI",
    category: "speech",
  },
  {
    name: "revai",
    package: "@ai-sdk/revai",
    envKey: "REVAI_API_KEY",
    defaultModel: "machine",
    factoryName: "createRevAI",
    modelAccess: "direct",
    displayName: "Rev.ai",
    category: "speech",
  },
  {
    name: "gladia",
    package: "@ai-sdk/gladia",
    envKey: "GLADIA_API_KEY",
    defaultModel: "enhanced",
    factoryName: "createGladia",
    modelAccess: "direct",
    displayName: "Gladia",
    category: "speech",
  },

  // ─── Media / Generation ───────────────────────────────────────────────────
  {
    name: "luma",
    package: "@ai-sdk/luma",
    envKey: "LUMA_API_KEY",
    defaultModel: "dream-machine",
    factoryName: "createLuma",
    modelAccess: "direct",
    displayName: "Luma",
    category: "media",
  },
  {
    name: "fal",
    package: "@ai-sdk/fal",
    envKey: "FAL_KEY",
    defaultModel: "fal-ai/flux/dev",
    factoryName: "createFal",
    modelAccess: "direct",
    displayName: "fal.ai",
    category: "media",
  },

  // ─── Routing / Compatible ─────────────────────────────────────────────────
  {
    name: "openai-compatible",
    package: "@ai-sdk/openai-compatible",
    envKey: undefined,
    defaultModel: "gpt-4o-mini",
    factoryName: "createOpenAICompatible",
    modelAccess: "direct",
    displayName: "OpenAI-Compatible",
    category: "compatible",
  },
] as const;

// =============================================================================
// Registry Helper Functions
// =============================================================================

/**
 * Find a provider spec by name (case-insensitive).
 * Returns undefined if not found.
 */
export function findByName(name: string): ProviderSpec | undefined {
  const lower = name.toLowerCase();
  return PROVIDER_REGISTRY.find((p) => p.name === lower);
}

/**
 * Find a provider spec by its environment variable key.
 * Returns undefined if not found.
 */
export function findByEnv(envKey: string): ProviderSpec | undefined {
  return PROVIDER_REGISTRY.find((p) => p.envKey === envKey);
}

/**
 * List all provider names in the registry.
 */
export function listAll(): string[] {
  return PROVIDER_REGISTRY.map((p) => p.name);
}

/**
 * List provider names by category.
 */
export function listByCategory(category: ProviderCategory): string[] {
  return PROVIDER_REGISTRY.filter((p) => p.category === category).map((p) => p.name);
}

/**
 * Find all providers that have an env key set in the current environment.
 * Useful for auto-detecting available providers.
 */
export function findAvailableByEnv(): ProviderSpec[] {
  return PROVIDER_REGISTRY.filter(
    (p) => p.envKey !== undefined && process.env[p.envKey]
  );
}

/**
 * Build a name→package lookup map (for backward compatibility with UniversalProvider).
 */
export function toPackageMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const spec of PROVIDER_REGISTRY) {
    map[spec.name] = spec.package;
  }
  return map;
}
