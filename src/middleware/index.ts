// =============================================================================
// Middleware — Public API
// =============================================================================

export { MiddlewareChain, composeMiddleware } from "./chain.js";
export { createLoggingMiddleware } from "./logging.js";
export type { LoggingMiddlewareOptions, LogEntry } from "./logging.js";
export { createCachingMiddleware } from "./caching.js";
export type { CachingMiddlewareOptions, CacheStats } from "./caching.js";
export { createHITLMiddleware } from "./hitl.js";
export type { HITLMiddlewareOptions, HITLDecision, HITLApprovalHandler } from "./hitl.js";
export { createProcessorPipeline } from "./processor.js";
export type { ProcessorPipelineOptions, InputProcessor, OutputProcessor, ProcessorResult } from "./processor.js";
export { createTripWireMiddleware } from "./trip-wire.js";
export type { TripWireOptions, TripWireViolation } from "./trip-wire.js";
export { createPromptCachingMiddleware } from "./prompt-caching.js";
export type { PromptCachingOptions } from "./prompt-caching.js";
export { createToolCallPatchingMiddleware } from "./tool-call-patching.js";
export type { ToolCallPatchingOptions } from "./tool-call-patching.js";
