// =============================================================================
// Planning Decorator — Injects planning tools into agent
// =============================================================================

import type { Decorator, RunContext } from "../core/agent/types.js";

export interface PlanningConfig {
  /** Enable plan visualization (default: true) */
  visualization?: boolean;
  /** Enable todo tracking (default: true) */
  todos?: boolean;
}

export function planning(_config?: PlanningConfig): Decorator {
  return {
    name: "planning",

    async beforeRun(ctx: RunContext) {
      // Inject planning context into system prompt
      const planningInstructions = [
        "You have access to planning tools for structured task decomposition.",
        "Use create_plan for complex multi-step tasks.",
        "Use write_todos to track progress on subtasks.",
        "Use get_plan_status to review current plan progress.",
      ].join("\n");

      if (!ctx.metadata["_planningInjected"]) {
        ctx.messages.push({
          role: "system",
          content: planningInstructions,
        });
        ctx.metadata["_planningInjected"] = true;
      }

      return ctx;
    },
  };
}
