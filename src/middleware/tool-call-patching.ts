// =============================================================================
// ToolCallPatching Middleware — Cross-provider tool call normalization
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeToolCallParams,
  BeforeToolCallResult,
  AfterToolCallParams,
  AfterToolCallResult,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";

export interface ToolCallPatchingOptions {
  /** Normalize stringified JSON args to objects (default: true) */
  parseStringArgs?: boolean;
  /** Strip null/undefined fields from args (default: false) */
  stripNullArgs?: boolean;
  /** Apply type coercion for common mismatches (default: true) */
  coerceTypes?: boolean;
  /** Rename tool calls using a mapping (e.g., provider-specific aliases) */
  aliasMap?: Record<string, string>;
  /** Normalize result format to standard shape (default: true) */
  normalizeResults?: boolean;
}

interface PatchStats {
  argsParsed: number;
  nullsStripped: number;
  typesCoerced: number;
  aliasesApplied: number;
  resultsNormalized: number;
}

/**
 * Normalizes tool call arguments and results across providers.
 *
 * Handles common issues:
 * - OpenAI sends args as stringified JSON, Anthropic sends objects
 * - Google wraps results differently than OpenAI
 * - Null fields that should be omitted
 * - Type mismatches (string "42" vs number 42)
 */
export function createToolCallPatchingMiddleware(
  options: ToolCallPatchingOptions = {},
): MiddlewarePort & { stats(): PatchStats } {
  const parseStringArgs = options.parseStringArgs ?? true;
  const stripNullArgs = options.stripNullArgs ?? false;
  const coerceTypes = options.coerceTypes ?? true;
  const aliasMap = options.aliasMap ?? {};
  const normalizeResults = options.normalizeResults ?? true;

  const stats: PatchStats = {
    argsParsed: 0,
    nullsStripped: 0,
    typesCoerced: 0,
    aliasesApplied: 0,
    resultsNormalized: 0,
  };

  function patchArgs(args: unknown): unknown {
    let result = args;

    // Parse stringified JSON
    if (parseStringArgs && typeof result === "string") {
      try {
        result = JSON.parse(result);
        stats.argsParsed++;
      } catch {
        // Not JSON, leave as-is
      }
    }

    if (typeof result !== "object" || result === null) return result;

    let obj = result as Record<string, unknown>;

    // Strip null/undefined fields
    if (stripNullArgs) {
      const cleaned: Record<string, unknown> = {};
      let stripped = false;
      for (const [k, v] of Object.entries(obj)) {
        if (v !== null && v !== undefined) {
          cleaned[k] = v;
        } else {
          stripped = true;
        }
      }
      if (stripped) {
        obj = cleaned;
        stats.nullsStripped++;
      }
    }

    // Coerce common type mismatches
    if (coerceTypes) {
      const coerced: Record<string, unknown> = {};
      let didCoerce = false;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") {
          // String → number
          if (/^-?\d+(\.\d+)?$/.test(v)) {
            coerced[k] = Number(v);
            didCoerce = true;
            continue;
          }
          // String → boolean
          if (v === "true" || v === "false") {
            coerced[k] = v === "true";
            didCoerce = true;
            continue;
          }
        }
        coerced[k] = v;
      }
      if (didCoerce) {
        obj = coerced;
        stats.typesCoerced++;
      }
    }

    return obj;
  }

  function normalizeResult(result: unknown): unknown {
    if (!normalizeResults) return result;

    // Unwrap common provider wrappers
    if (typeof result === "object" && result !== null) {
      const r = result as Record<string, unknown>;
      // Google Gemini wraps in { functionResponse: { response: { ... } } }
      if ("functionResponse" in r && typeof r.functionResponse === "object") {
        const fr = r.functionResponse as Record<string, unknown>;
        if ("response" in fr) {
          stats.resultsNormalized++;
          return fr.response;
        }
      }
      // Some providers wrap in { output: ... }
      if ("output" in r && Object.keys(r).length === 1) {
        stats.resultsNormalized++;
        return r.output;
      }
    }

    return result;
  }

  const middleware: MiddlewarePort & { stats(): PatchStats } = {
    name: "gauss:tool-call-patching",
    priority: MiddlewarePriority.EARLY,

    beforeTool(
      _ctx: MiddlewareContext,
      params: BeforeToolCallParams,
    ): BeforeToolCallResult | void {
      const patchedArgs = patchArgs(params.args);
      const toolName = aliasMap[params.toolName] ?? params.toolName;

      if (toolName !== params.toolName) stats.aliasesApplied++;

      const argsChanged = patchedArgs !== params.args;
      const nameChanged = toolName !== params.toolName;

      if (argsChanged || nameChanged) {
        return { args: patchedArgs };
      }
    },

    afterTool(
      _ctx: MiddlewareContext,
      params: AfterToolCallParams,
    ): AfterToolCallResult | void {
      const normalized = normalizeResult(params.result);
      if (normalized !== params.result) {
        return { result: normalized };
      }
    },

    stats() {
      return { ...stats };
    },
  };

  return middleware;
}
