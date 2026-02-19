import type { TaskToolConfig } from "./task.tool.js";
import { createTaskTool } from "./task.tool.js";
import type { Tool } from "ai";
import type { SubagentRegistry } from "./subagent-registry.js";
import { createDispatchTool } from "./dispatch.tool.js";
import { createPollTool } from "./poll.tool.js";
import { createAwaitTool } from "./await.tool.js";

// Legacy sync tool exports
export { createTaskTool } from "./task.tool.js";
export type { TaskToolConfig } from "./task.tool.js";

// New async subagent exports
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
// Legacy sync tool set (backward compatible)
// ---------------------------------------------------------------------------

interface SubagentToolSet {
  task: ReturnType<typeof createTaskTool>;
}

export function createSubagentTools(config: TaskToolConfig): SubagentToolSet {
  return {
    task: createTaskTool(config),
  };
}

// ---------------------------------------------------------------------------
// New async 3-tool set
// ---------------------------------------------------------------------------

export interface AsyncSubagentToolsConfig {
  registry: SubagentRegistry;
  parentId: string;
  maxDepth: number;
  currentDepth: number;
}

export function createAsyncSubagentTools(
  config: AsyncSubagentToolsConfig,
): Record<string, Tool> {
  const { registry, parentId, currentDepth } = config;

  return {
    dispatch_subagent: createDispatchTool({ registry, parentId, currentDepth }),
    poll_subagent: createPollTool({ registry }),
    await_subagent: createAwaitTool({ registry }),
  };
}
