// =============================================================================
// DefaultToolCompositionAdapter — pipe, fallback, and middleware for AI SDK tools
// =============================================================================

import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

import type {
  ToolCompositionPort,
  ToolMiddleware,
  ToolPipeline,
} from "../../ports/tool-composition.port.js";

// ---------------------------------------------------------------------------
// Pipeline implementation
// ---------------------------------------------------------------------------

interface PipeEntry {
  names: string[];
}

interface FallbackEntry {
  primary: string;
  fallback: string;
}

class DefaultToolPipeline implements ToolPipeline {
  private readonly tools: Record<string, Tool>;
  private readonly pipes: PipeEntry[] = [];
  private readonly fallbacks: FallbackEntry[] = [];
  private readonly middlewares: ToolMiddleware[] = [];

  constructor(
    tools: Record<string, Tool>,
    pipes: PipeEntry[] = [],
    fallbacks: FallbackEntry[] = [],
    middlewares: ToolMiddleware[] = [],
  ) {
    this.tools = { ...tools };
    this.pipes = [...pipes];
    this.fallbacks = [...fallbacks];
    this.middlewares = [...middlewares];
  }

  pipe(names: string[]): ToolPipeline {
    return new DefaultToolPipeline(
      this.tools,
      [...this.pipes, { names }],
      this.fallbacks,
      this.middlewares,
    );
  }

  withFallback(primary: string, fallback: string): ToolPipeline {
    return new DefaultToolPipeline(
      this.tools,
      this.pipes,
      [...this.fallbacks, { primary, fallback }],
      this.middlewares,
    );
  }

  withMiddleware(middleware: ToolMiddleware): ToolPipeline {
    return new DefaultToolPipeline(
      this.tools,
      this.pipes,
      this.fallbacks,
      [...this.middlewares, middleware],
    );
  }

  build(): Record<string, Tool> {
    const result: Record<string, Tool> = { ...this.tools };

    // Apply fallbacks — wrap primary tool to fall back on error
    for (const { primary, fallback } of this.fallbacks) {
      const primaryTool = result[primary];
      const fallbackTool = result[fallback];
      if (!primaryTool) throw new Error(`Fallback composition failed: primary tool "${primary}" not found`);
      if (!fallbackTool) throw new Error(`Fallback composition failed: fallback tool "${fallback}" not found`);

      result[primary] = this.wrapWithFallback(primary, primaryTool, fallbackTool);
    }

    // Apply pipes — create composite tools
    for (const { names } of this.pipes) {
      if (names.length < 2) continue;

      const pipelineName = names.join("_pipe_");
      const firstTool = result[names[0]];
      if (!firstTool) throw new Error(`Pipe composition failed: first tool "${names[0]}" not found`);

      result[pipelineName] = this.buildPipeTool(pipelineName, names, result);
    }

    // Apply middlewares — wrap every tool
    if (this.middlewares.length > 0) {
      for (const name of Object.keys(result)) {
        result[name] = this.wrapWithMiddlewares(name, result[name]);
      }
    }

    return result;
  }

  // ---- internal helpers ---------------------------------------------------

  private wrapWithFallback(name: string, primary: Tool, fallbackTool: Tool): Tool {
    const originalExecute = primary.execute;
    const fallbackExecute = fallbackTool.execute;

    return tool({
      description: primary.description ?? "",
      inputSchema: (primary as any).inputSchema ?? z.object({}).passthrough(),
      execute: async (args: any) => {
        try {
          return await originalExecute!(args, { toolCallId: "", messages: [], abortSignal: undefined as any });
        } catch {
          return await fallbackExecute!(args, { toolCallId: "", messages: [], abortSignal: undefined as any });
        }
      },
    }) as unknown as Tool;
  }

  private buildPipeTool(
    pipelineName: string,
    names: string[],
    allTools: Record<string, Tool>,
  ): Tool {
    const firstTool = allTools[names[0]];
    const descriptions = names
      .map((n) => allTools[n]?.description ?? n)
      .join(" → ");

    // Snapshot execute functions at build time so middleware wrapping
    // does not affect inner tool calls — middleware fires only on the pipe.
    const steps = names.map((toolName) => {
      const t = allTools[toolName];
      if (!t?.execute) {
        throw new Error(`Tool "${toolName}" not found or has no execute function`);
      }
      return t.execute!;
    });

    return tool({
      description: `Pipeline: ${descriptions}`,
      inputSchema: (firstTool as any).inputSchema ?? z.object({}).passthrough(),
      execute: async (args: any) => {
        let current: unknown = args;
        for (const execFn of steps) {
          current = await execFn(current as any, {
            toolCallId: "",
            messages: [],
            abortSignal: undefined as any,
          });
        }
        return current;
      },
    }) as unknown as Tool;
  }

  private wrapWithMiddlewares(name: string, t: Tool): Tool {
    const originalExecute = t.execute;
    const middlewares = this.middlewares;

    return tool({
      description: t.description ?? "",
      inputSchema: (t as any).inputSchema ?? z.object({}).passthrough(),
      execute: async (args: any) => {
        let currentArgs: unknown = args;

        // Run before hooks
        for (const mw of middlewares) {
          if (mw.before) {
            currentArgs = await mw.before(name, currentArgs);
          }
        }

        let result: unknown;
        try {
          result = await originalExecute!(currentArgs as any, {
            toolCallId: "",
            messages: [],
            abortSignal: undefined as any,
          });
        } catch (err) {
          // Run onError hooks (last middleware first for error handling)
          for (let i = middlewares.length - 1; i >= 0; i--) {
            const mw = middlewares[i];
            if (mw.onError) {
              const fallback = await mw.onError(name, err as Error);
              if (fallback != null) return fallback;
            }
          }
          throw err;
        }

        // Run after hooks
        for (const mw of middlewares) {
          if (mw.after) {
            result = await mw.after(name, result);
          }
        }

        return result;
      },
    }) as unknown as Tool;
  }
}

// ---------------------------------------------------------------------------
// Adapter (port implementation)
// ---------------------------------------------------------------------------

export class DefaultToolCompositionAdapter implements ToolCompositionPort {
  createPipeline(tools: Record<string, Tool>): ToolPipeline {
    return new DefaultToolPipeline(tools);
  }
}
