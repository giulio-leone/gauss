// =============================================================================
// MiddlewareChain — Priority-ordered middleware executor
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareChainPort,
  MiddlewareContext,
  BeforeAgentParams,
  BeforeAgentResult,
  BeforeAgentChainResult,
  AfterAgentParams,
  AfterAgentResult,
  BeforeToolCallParams,
  BeforeToolCallResult,
  AfterToolCallParams,
  AfterToolCallResult,
  OnMiddlewareErrorParams,
} from "../ports/middleware.port.js";

export class MiddlewareChain implements MiddlewareChainPort {
  private middlewares: MiddlewarePort[] = [];
  private sorted = true;

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  use(middleware: MiddlewarePort): void {
    if (this.middlewares.some((m) => m.name === middleware.name)) {
      throw new Error(`Middleware "${middleware.name}" is already registered`);
    }
    this.middlewares.push(middleware);
    this.sorted = false;
  }

  remove(name: string): boolean {
    const idx = this.middlewares.findIndex((m) => m.name === name);
    if (idx === -1) return false;
    this.middlewares.splice(idx, 1);
    return true;
  }

  list(): readonly MiddlewarePort[] {
    this.ensureSorted();
    return this.middlewares;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async setup(ctx: MiddlewareContext): Promise<void> {
    this.ensureSorted();
    for (const mw of this.middlewares) {
      if (mw.setup) {
        await mw.setup(ctx);
      }
    }
  }

  async teardown(ctx: MiddlewareContext): Promise<void> {
    // Teardown in reverse order
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i];
      if (mw.teardown) {
        try {
          await mw.teardown(ctx);
        } catch {
          // Teardown errors should not block other teardowns
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // beforeAgent — forward order, accumulate mutations
  // ---------------------------------------------------------------------------

  async runBeforeAgent(
    ctx: MiddlewareContext,
    params: BeforeAgentParams,
  ): Promise<BeforeAgentChainResult> {
    this.ensureSorted();
    let current = { ...params };

    for (const mw of this.middlewares) {
      if (!mw.beforeAgent) continue;

      let result: BeforeAgentResult | void;
      try {
        result = await mw.beforeAgent(ctx, current);
      } catch (error) {
        const shouldContinue = await this.handleError(ctx, {
          error,
          phase: "beforeAgent",
          middlewareName: mw.name,
        });
        if (!shouldContinue) throw error;
        continue;
      }

      if (!result) continue;

      if (result.abort) {
        return {
          ...current,
          aborted: true,
          earlyResult: result.earlyResult,
        };
      }

      current = {
        prompt: result.prompt ?? current.prompt,
        instructions: result.instructions ?? current.instructions,
        tools: result.tools
          ? { ...current.tools, ...result.tools }
          : current.tools,
      };
    }

    return current;
  }

  // ---------------------------------------------------------------------------
  // afterAgent — reverse order, accumulate mutations
  // ---------------------------------------------------------------------------

  async runAfterAgent(
    ctx: MiddlewareContext,
    params: AfterAgentParams,
  ): Promise<AfterAgentParams> {
    this.ensureSorted();
    let current = { ...params };

    // After hooks run in reverse priority (LAST → FIRST)
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i];
      if (!mw.afterAgent) continue;

      let result: AfterAgentResult | void;
      try {
        result = await mw.afterAgent(ctx, current);
      } catch (error) {
        const shouldContinue = await this.handleError(ctx, {
          error,
          phase: "afterAgent",
          middlewareName: mw.name,
        });
        if (!shouldContinue) throw error;
        continue;
      }

      if (result?.text !== undefined) {
        current = {
          ...current,
          result: { ...current.result, text: result.text },
        };
      }
    }

    return current;
  }

  // ---------------------------------------------------------------------------
  // beforeTool — forward order
  // ---------------------------------------------------------------------------

  async runBeforeTool(
    ctx: MiddlewareContext,
    params: BeforeToolCallParams,
  ): Promise<BeforeToolCallResult> {
    this.ensureSorted();
    let currentArgs = params.args;

    for (const mw of this.middlewares) {
      if (!mw.beforeTool) continue;

      let result: BeforeToolCallResult | void;
      try {
        result = await mw.beforeTool(ctx, {
          ...params,
          args: currentArgs,
        });
      } catch (error) {
        const shouldContinue = await this.handleError(ctx, {
          error,
          phase: "beforeTool",
          middlewareName: mw.name,
        });
        if (!shouldContinue) throw error;
        continue;
      }

      if (!result) continue;

      if (result.skip) {
        return { skip: true, mockResult: result.mockResult };
      }

      if (result.args !== undefined) {
        currentArgs = result.args;
      }
    }

    return { args: currentArgs };
  }

  // ---------------------------------------------------------------------------
  // afterTool — reverse order
  // ---------------------------------------------------------------------------

  async runAfterTool(
    ctx: MiddlewareContext,
    params: AfterToolCallParams,
  ): Promise<AfterToolCallParams> {
    this.ensureSorted();
    let current = { ...params };

    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i];
      if (!mw.afterTool) continue;

      let result: AfterToolCallResult | void;
      try {
        result = await mw.afterTool(ctx, current);
      } catch (error) {
        const shouldContinue = await this.handleError(ctx, {
          error,
          phase: "afterTool",
          middlewareName: mw.name,
        });
        if (!shouldContinue) throw error;
        continue;
      }

      if (result?.result !== undefined) {
        current = { ...current, result: result.result };
      }
    }

    return current;
  }

  // ---------------------------------------------------------------------------
  // Error handling — delegates to middleware onError hooks
  // ---------------------------------------------------------------------------

  private async handleError(
    ctx: MiddlewareContext,
    params: OnMiddlewareErrorParams,
  ): Promise<boolean> {
    for (const mw of this.middlewares) {
      if (!mw.onError) continue;
      try {
        const result = await mw.onError(ctx, params);
        if (result?.suppress) return true;
      } catch {
        // Error handler itself failed — ignore and continue
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Internal — sort by priority (stable sort)
  // ---------------------------------------------------------------------------

  private ensureSorted(): void {
    if (this.sorted) return;
    this.middlewares.sort((a, b) => a.priority - b.priority);
    this.sorted = true;
  }
}

// =============================================================================
// compose — Merge multiple middleware into a single middleware unit
// =============================================================================

export function composeMiddleware(
  name: string,
  ...middlewares: MiddlewarePort[]
): MiddlewarePort {
  const chain = new MiddlewareChain();
  for (const mw of middlewares) {
    chain.use(mw);
  }

  // Use the lowest priority among composed middleware
  const priority = middlewares.length > 0
    ? Math.min(...middlewares.map((m) => m.priority))
    : 500;

  return {
    name,
    priority,
    async setup(ctx) { await chain.setup(ctx); },
    async teardown(ctx) { await chain.teardown(ctx); },
    async beforeAgent(ctx, params) {
      const result = await chain.runBeforeAgent(ctx, params);
      if (result.prompt !== params.prompt || result.instructions !== params.instructions) {
        return { prompt: result.prompt, instructions: result.instructions };
      }
    },
    async afterAgent(ctx, params) {
      const result = await chain.runAfterAgent(ctx, params);
      if (result.result.text !== params.result.text) {
        return { text: result.result.text };
      }
    },
    async beforeTool(ctx, params) {
      return chain.runBeforeTool(ctx, params);
    },
    async afterTool(ctx, params) {
      const result = await chain.runAfterTool(ctx, params);
      if (result.result !== params.result) {
        return { result: result.result };
      }
    },
  };
}
