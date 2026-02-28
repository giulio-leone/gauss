// =============================================================================
// Gauss Decorators — Barrel Export
// =============================================================================

export { memory } from "./memory.js";
export type { MemoryPort, MemoryDecoratorConfig } from "./memory.js";

export { telemetry } from "./telemetry.js";
export type { TelemetryPort, TelemetrySpan, TelemetryDecoratorConfig } from "./telemetry.js";

export { resilience } from "./resilience.js";
export type { ResilienceConfig, CircuitBreakerOptions, CacheOptions } from "./resilience.js";

export { costLimit } from "./cost-limit.js";
export type { CostLimitConfig } from "./cost-limit.js";

export { planning } from "./planning.js";
export type { PlanningConfig } from "./planning.js";

export { approval } from "./approval.js";
export type { ApprovalConfig, ApprovalRequest, ApprovalResponse } from "./approval.js";

export { learning } from "./learning.js";
export type { LearningPort, LearningConfig, UserProfile, UserMemory } from "./learning.js";

export { checkpoint } from "./checkpoint.js";
export type { CheckpointStorage, CheckpointData, CheckpointConfig } from "./checkpoint.js";
