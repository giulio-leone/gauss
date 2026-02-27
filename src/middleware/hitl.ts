// =============================================================================
// HITLMiddleware — Human-in-the-loop per-tool interrupt, approve/reject/edit
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeToolCallParams,
  BeforeToolCallResult,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";

// =============================================================================
// HITL Decision types
// =============================================================================

export type HITLDecision =
  | { action: "approve" }
  | { action: "reject"; reason?: string }
  | { action: "edit"; args: unknown };

export type HITLApprovalHandler = (
  toolName: string,
  args: unknown,
  ctx: MiddlewareContext,
) => Promise<HITLDecision>;

export interface HITLMiddlewareOptions {
  /** Handler invoked when a tool requires approval */
  approvalHandler: HITLApprovalHandler;
  /** Tool names that require HITL approval (if empty, requires approval for all) */
  requireApproval?: string[];
  /** Tool names that never require approval */
  alwaysAllow?: string[];
  /** Timeout in ms for approval (auto-rejects on timeout) */
  timeoutMs?: number;
  /** Default decision when timeout occurs (default: reject) */
  onTimeout?: "approve" | "reject";
}

export function createHITLMiddleware(
  options: HITLMiddlewareOptions,
): MiddlewarePort {
  const timeoutMs = options.timeoutMs ?? 300_000; // 5 min default
  const onTimeout = options.onTimeout ?? "reject";

  function needsApproval(toolName: string): boolean {
    if (options.alwaysAllow?.includes(toolName)) return false;
    if (options.requireApproval && options.requireApproval.length > 0) {
      return options.requireApproval.includes(toolName);
    }
    return true;
  }

  return {
    name: "gauss:hitl",
    priority: MiddlewarePriority.FIRST,

    async beforeTool(
      ctx: MiddlewareContext,
      params: BeforeToolCallParams,
    ): Promise<BeforeToolCallResult | void> {
      if (!needsApproval(params.toolName)) return;

      let decision: HITLDecision;
      try {
        decision = await Promise.race([
          options.approvalHandler(params.toolName, params.args, ctx),
          new Promise<HITLDecision>((resolve) =>
            setTimeout(
              () =>
                resolve(
                  onTimeout === "approve"
                    ? { action: "approve" }
                    : { action: "reject", reason: "Approval timed out" },
                ),
              timeoutMs,
            ),
          ),
        ]);
      } catch {
        decision = { action: "reject", reason: "Approval handler error" };
      }

      switch (decision.action) {
        case "approve":
          return;
        case "reject":
          return {
            skip: true,
            mockResult: {
              error: `Tool call rejected${decision.reason ? `: ${decision.reason}` : ""}`,
            },
          };
        case "edit":
          return { args: decision.args };
      }
    },
  };
}
