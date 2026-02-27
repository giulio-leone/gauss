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
