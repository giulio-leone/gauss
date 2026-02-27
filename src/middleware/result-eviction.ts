// =============================================================================
// ResultEvictionMiddleware — Offload oversized tool results to storage
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  AfterToolCallParams,
  AfterToolCallResult,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";

export interface ResultEvictionOptions {
  /** Token threshold for eviction (default: 50_000) */
  tokenThreshold?: number;
  /** Tools excluded from eviction */
  excludeTools?: string[];
  /** Store evicted content */
  store: (id: string, content: string) => Promise<void>;
}

export function createResultEvictionMiddleware(
  options: ResultEvictionOptions,
): MiddlewarePort {
  const threshold = options.tokenThreshold ?? 50_000;
  const excluded = new Set(options.excludeTools ?? ["ls", "glob", "grep"]);
  let evictionCounter = 0;

  return {
    name: "gauss:result-eviction",
    priority: MiddlewarePriority.LATE,

    async afterTool(
      _ctx: MiddlewareContext,
      params: AfterToolCallParams,
    ): Promise<AfterToolCallResult | void> {
      if (excluded.has(params.toolName)) return;

      let resultStr: string;
      try {
        resultStr = typeof params.result === "string"
          ? params.result
          : JSON.stringify(params.result);
      } catch {
        // Non-serializable result — skip eviction
        return;
      }

      const estimatedTokens = Math.ceil(resultStr.length / 4);

      if (estimatedTokens > threshold) {
        const id = `evicted-${++evictionCounter}-${Date.now()}`;
        await options.store(id, resultStr);

        return {
          result: `[Result evicted to storage: ${id}] (${estimatedTokens} tokens, tool: ${params.toolName}). Use retrieval to access if needed.`,
        };
      }
    },
  };
}
