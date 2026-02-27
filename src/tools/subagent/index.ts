import type { Tool } from "ai";
import type { DelegationHooks } from "../../types.js";
import type { SubagentRegistry } from "./subagent-registry.js";
import { createDispatchTool } from "./dispatch.tool.js";
import { createPollTool } from "./poll.tool.js";
import { createAwaitTool } from "./await.tool.js";

// Async subagent exports
export { SubagentRegistry } from "./subagent-registry.js";
export type {
  SubagentHandle,
  SubagentTaskStatus,
  SubagentResourceLimits,
  DispatchParams,
} from "./subagent-registry.js";
export { SubagentScheduler } from "./subagent-scheduler.js";
export type { PoolConfig } from "./subagent-scheduler.js";
export { createDispatchTool } from "./dispatch.tool.js";
export { createPollTool } from "./poll.tool.js";
export { createAwaitTool } from "./await.tool.js";

// ---------------------------------------------------------------------------
// Async 3-tool set
// ---------------------------------------------------------------------------

export interface AsyncSubagentToolsConfig {
  registry: SubagentRegistry;
  parentId: string;
  maxDepth: number;
  currentDepth: number;
  hooks?: DelegationHooks;
}

export function createAsyncSubagentTools(
  config: AsyncSubagentToolsConfig,
): Record<string, Tool> {
  const { registry, parentId, currentDepth, hooks } = config;

  return {
    dispatch_subagent: createDispatchTool({
      registry,
      parentId,
      currentDepth,
      hooks,
    }),
    poll_subagent: createPollTool({ registry }),
    await_subagent: createAwaitTool({ registry, hooks }),
  };
}
