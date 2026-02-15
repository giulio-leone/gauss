// =============================================================================
// GuardrailsPlugin — Input/output validation and content filtering
// =============================================================================

import type {
  PluginHooks,
  PluginContext,
  BeforeRunParams,
  BeforeRunResult,
  AfterRunParams,
  BeforeToolParams,
  BeforeToolResult,
} from "../ports/plugin.port.js";
import { BasePlugin } from "./base.plugin.js";
import type { ZodType } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentFilter {
  readonly name: string;
  test(content: string): boolean;
}

export interface GuardrailsPluginOptions {
  /** Zod schema to validate the input prompt */
  inputSchema?: ZodType;
  /** Zod schema to validate the output text */
  outputSchema?: ZodType;
  /** Per-tool argument validation schemas (keyed by tool name) */
  toolSchemas?: Record<string, ZodType>;
  /** Content filters applied to both input and output */
  contentFilters?: ContentFilter[];
  /** Custom input validators */
  inputValidators?: Array<(prompt: string) => string | null>;
  /** Custom output validators */
  outputValidators?: Array<(output: string) => string | null>;
  /** Action on validation failure: 'throw' (default) or 'warn' */
  onFailure?: "throw" | "warn";
}

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class GuardrailsError extends Error {
  readonly code: "input_validation" | "output_validation" | "content_filter" | "tool_validation";

  constructor(code: GuardrailsError["code"], message: string) {
    super(message);
    this.name = "GuardrailsError";
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export class GuardrailsPlugin extends BasePlugin {
  readonly name = "guardrails";

  private readonly options: Required<
    Pick<GuardrailsPluginOptions, "onFailure" | "contentFilters" | "inputValidators" | "outputValidators">
  > &
    Pick<GuardrailsPluginOptions, "inputSchema" | "outputSchema" | "toolSchemas">;

  constructor(options: GuardrailsPluginOptions = {}) {
    super();
    this.options = {
      onFailure: options.onFailure ?? "throw",
      contentFilters: options.contentFilters ?? [],
      inputValidators: options.inputValidators ?? [],
      outputValidators: options.outputValidators ?? [],
      inputSchema: options.inputSchema,
      outputSchema: options.outputSchema,
      toolSchemas: options.toolSchemas,
    };
  }

  protected buildHooks(): PluginHooks {
    return {
      beforeRun: this.beforeRun.bind(this),
      afterRun: this.afterRun.bind(this),
      beforeTool: this.beforeTool.bind(this),
    };
  }

  // ── Hook implementations ──────────────────────────────────────────────────

  private beforeRun(_ctx: PluginContext, params: BeforeRunParams): BeforeRunResult | void {
    const { prompt } = params;

    for (const filter of this.options.contentFilters) {
      if (filter.test(prompt)) {
        this.fail("content_filter", `Content filter "${filter.name}" matched input`);
      }
    }

    for (const validator of this.options.inputValidators) {
      const error = validator(prompt);
      if (error) {
        this.fail("input_validation", error);
      }
    }

    if (this.options.inputSchema) {
      const result = this.options.inputSchema.safeParse(prompt);
      if (!result.success) {
        this.fail("input_validation", `Input schema validation failed: ${result.error.message}`);
      }
    }

    return { prompt };
  }

  private afterRun(_ctx: PluginContext, params: AfterRunParams): void {
    const { text } = params.result;

    for (const filter of this.options.contentFilters) {
      if (filter.test(text)) {
        this.fail("content_filter", `Content filter "${filter.name}" matched output`);
      }
    }

    for (const validator of this.options.outputValidators) {
      const error = validator(text);
      if (error) {
        this.fail("output_validation", error);
      }
    }

    if (this.options.outputSchema) {
      const result = this.options.outputSchema.safeParse(text);
      if (!result.success) {
        this.fail("output_validation", `Output schema validation failed: ${result.error.message}`);
      }
    }
  }

  private beforeTool(_ctx: PluginContext, params: BeforeToolParams): BeforeToolResult | void {
    const schema = this.options.toolSchemas?.[params.toolName];
    if (!schema) return;

    const result = schema.safeParse(params.args);
    if (!result.success) {
      this.fail("tool_validation", `Tool "${params.toolName}" args validation failed: ${result.error.message}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private fail(code: GuardrailsError["code"], message: string): void {
    if (this.options.onFailure === "warn") {
      console.warn(`[guardrails] ${message}`);
      return;
    }
    throw new GuardrailsError(code, message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createGuardrailsPlugin(options: GuardrailsPluginOptions = {}): GuardrailsPlugin {
  return new GuardrailsPlugin(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Content Filters
// ─────────────────────────────────────────────────────────────────────────────

export function createPiiFilter(): ContentFilter {
  return {
    name: "pii",
    test(content: string): boolean {
      const patterns = [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // email
        /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN
        /\b\d{16}\b/, // credit card (basic)
      ];
      return patterns.some((p) => p.test(content));
    },
  };
}
