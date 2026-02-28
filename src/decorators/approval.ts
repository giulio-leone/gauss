// =============================================================================
// Approval Decorator — Human-in-the-loop tool call gating
// =============================================================================

import type { Decorator, RunContext, ToolCallContext } from "../core/agent/types.js";

export interface ApprovalConfig {
  mode: "approve-all" | "require-approval" | "auto-approve";
  /** Tools that always need approval (when mode is "auto-approve") */
  requireApprovalFor?: string[];
  /** Tools that never need approval (when mode is "require-approval") */
  autoApproveFor?: string[];
  /** Custom approval handler */
  handler?: (request: ApprovalRequest) => Promise<ApprovalResponse>;
}

export interface ApprovalRequest {
  toolName: string;
  toolArgs: unknown;
  toolCallId: string;
  prompt: string;
}

export interface ApprovalResponse {
  approved: boolean;
  reason?: string;
}

export function approval(config: ApprovalConfig): Decorator {
  const { mode, requireApprovalFor = [], autoApproveFor = [], handler } = config;

  function needsApproval(toolName: string): boolean {
    switch (mode) {
      case "approve-all":
        return false;
      case "require-approval":
        return !autoApproveFor.includes(toolName);
      case "auto-approve":
        return requireApprovalFor.includes(toolName);
      default:
        return false;
    }
  }

  return {
    name: "approval",

    async beforeToolCall(ctx: ToolCallContext) {
      if (!needsApproval(ctx.toolName)) return ctx;

      if (!handler) {
        throw new Error(
          `Tool "${ctx.toolName}" requires approval but no handler is configured`,
        );
      }

      const response = await handler({
        toolName: ctx.toolName,
        toolArgs: ctx.toolArgs,
        toolCallId: ctx.toolCallId,
        prompt: ctx.prompt,
      });

      if (!response.approved) {
        throw new Error(
          `Tool "${ctx.toolName}" was rejected: ${response.reason ?? "No reason given"}`,
        );
      }

      return ctx;
    },
  };
}
