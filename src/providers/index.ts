// =============================================================================
// gauss/providers — Provider adapters
// =============================================================================
//
// The primary way to create models is via the native gauss() factory:
//   import { gauss } from 'gauss/providers'
//   const model = gauss('openai', 'gpt-4o')
//
// Additional provider adapters for local/specialized use:
//   - ollama('model')      — local Ollama inference
//   - openrouter('model')  — OpenRouter multi-provider routing
//   - universalProvider()   — auto-detect provider from model string
//
// =============================================================================

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
