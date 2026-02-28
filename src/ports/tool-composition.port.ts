// =============================================================================
// ToolCompositionPort — Compose, pipe, and wrap AI SDK tools
// =============================================================================

import type { Tool } from "../core/llm/index.js";

export interface ToolMiddleware {
  name: string;
  before?(toolName: string, args: unknown): Promise<unknown>;
  after?(toolName: string, result: unknown): Promise<unknown>;
  onError?(toolName: string, error: Error): Promise<unknown> | null;
}

export interface ToolPipeline {
  pipe(tools: string[]): ToolPipeline;
  withFallback(primary: string, fallback: string): ToolPipeline;
  withMiddleware(middleware: ToolMiddleware): ToolPipeline;
  build(): Record<string, Tool>;
}

export interface ToolCompositionPort {
  createPipeline(tools: Record<string, Tool>): ToolPipeline;
}
