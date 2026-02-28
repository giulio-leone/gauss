// =============================================================================
// Gauss Agent Core — Barrel Export
// =============================================================================

export { Agent } from "./agent.js";
export { agentsToTools } from "./subagent.js";
export { runAgent } from "./run.js";
export { streamAgent } from "./stream.js";
export { graph } from "./graph.js";
export type { GraphConfig, GraphResult, GraphPipeline } from "./graph.js";

export type {
  AgentConfig,
  AgentFactory,
  AgentInstance,
  AgentResult,
  AgentStream,
  CostInfo,
  Decorator,
  OutputSpec,
  RunContext,
  RunOptions,
  StepContext,
  StopCondition,
  StopConditionEvent,
  StreamChunk,
  ToolCallContext,
} from "./types.js";
