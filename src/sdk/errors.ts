/**
 * Structured error hierarchy for Gauss SDK.
 *
 * All Gauss errors extend {@link GaussError} to enable type-safe catch blocks:
 *
 * ```ts
 * try {
 *   await agent.run("hello");
 * } catch (e) {
 *   if (e instanceof AgentDisposedError) { ... }
 *   if (e instanceof ProviderError) { ... }
 * }
 * ```
 *
 * @module errors
 * @since 2.1.0
 */

/** Base error for all Gauss SDK errors. Includes an error code for programmatic matching. */
export class GaussError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GaussError";
    this.code = code;
  }
}

/** Thrown when an operation is attempted on a destroyed Agent/Team/Graph. */
export class DisposedError extends GaussError {
  readonly resourceType: string;
  readonly resourceName: string;
  constructor(resourceType: string, resourceName: string) {
    super("RESOURCE_DISPOSED", `${resourceType} "${resourceName}" has been destroyed. Create a new instance.`);
    this.name = "DisposedError";
    this.resourceType = resourceType;
    this.resourceName = resourceName;
  }
}

/** Thrown when provider initialization or communication fails. */
export class ProviderError extends GaussError {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super("PROVIDER_ERROR", `[${provider}] ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
  }
}

/** Thrown when tool execution fails. */
export class ToolExecutionError extends GaussError {
  readonly toolName: string;
  readonly cause?: Error;
  constructor(toolName: string, message: string, cause?: Error) {
    super("TOOL_EXECUTION_ERROR", `Tool "${toolName}" failed: ${message}`);
    this.name = "ToolExecutionError";
    this.toolName = toolName;
    this.cause = cause;
  }
}

/** Thrown when configuration validation fails. */
export class ValidationError extends GaussError {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super("VALIDATION_ERROR", field ? `Invalid "${field}": ${message}` : message);
    this.name = "ValidationError";
    this.field = field;
  }
}
