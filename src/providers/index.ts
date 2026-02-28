// =============================================================================
// gauss/providers — Unified provider adapters
// =============================================================================
//
// Thin wrappers around @ai-sdk/* providers with Gauss-specific defaults:
// - Auto-detect API keys from environment variables
// - Sensible default model selections
// - Type-safe re-exports
//
// Usage:
//   import { openai } from 'gauss/providers'
//   const myAgent = agent({ model: openai('gpt-5.2'), instructions: '...' })
//
// =============================================================================

export { openai, type OpenAIProviderOptions } from "./openai.js";
export { anthropic, type AnthropicProviderOptions } from "./anthropic.js";
export { google, type GoogleProviderOptions } from "./google.js";
export { groq, type GroqProviderOptions } from "./groq.js";
export { ollama, type OllamaProviderOptions } from "./ollama.js";
export { openrouter, type OpenRouterProviderOptions } from "./openrouter.js";
export { UniversalProvider, universalProvider } from "./universal.js";
export type { ProviderConfig, UniversalProviderOptions } from "./universal.js";
export {
  gauss,
  gaussAgentRun,
  gaussAgentStream,
  gaussFallback,
  createNativeMiddlewareChain,
  nativeMiddleware,
  nativeBenchmark,
  nativeBenchmarkCompare,
  countTokens,
  countTokensForModel,
  cosineSimilarity,
  isNativeAvailable,
  nativeVersion,
  setNapi,
  type GaussProviderType,
  type GaussProviderOptions,
  type NativeStreamEvent,
  type FallbackProviderOptions,
  type NativeMiddlewareConfig,
  type NativeMiddlewareChain,
  type GuardrailConfig,
  type TelemetryConfig,
  type BenchmarkResult,
} from "./gauss.js";
