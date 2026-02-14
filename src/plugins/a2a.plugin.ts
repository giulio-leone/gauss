// =============================================================================
// A2APlugin — A2A server integration + remote A2A call tool
// =============================================================================

import { tool, type Tool } from "ai";
import { z } from "zod";

import type { DeepAgentResult, DeepAgentRunOptions } from "../agent/deep-agent.js";
import type {
  DeepAgentPlugin,
  PluginContext,
  PluginSetupContext,
} from "../ports/plugin.port.js";
import {
  createA2AHttpHandler,
  createA2AJsonRpcHandler,
  type A2AJsonRpcRequest,
  type A2AJsonRpcResponse,
  type A2ATask,
} from "./a2a-handler.js";
import type { AgentCardProvider } from "./agent-card.plugin.js";

export interface A2AAgentRuntime {
  sessionId: string;
  run(prompt: string, options?: DeepAgentRunOptions): Promise<DeepAgentResult>;
}

export interface A2APluginOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  agentCardProvider?: AgentCardProvider;
}

const A2A_CALL_SCHEMA = z.object({
  endpoint: z.string().url(),
  method: z.enum(["tasks/send", "tasks/get", "tasks/list", "tasks/cancel", "agent/card", "health"]).default("tasks/send"),
  prompt: z.string().optional(),
  taskId: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export class A2APlugin implements DeepAgentPlugin {
  readonly name = "a2a";
  readonly version = "1.0.0";
  readonly tools: Record<string, Tool>;

  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly agentCardProvider?: AgentCardProvider;
  private readonly tasks = new Map<string, A2ATask>();

  private setupCtx?: PluginSetupContext;
  private latestCtx?: PluginContext;

  readonly hooks = {
    beforeRun: async (ctx: PluginContext): Promise<void> => {
      this.latestCtx = ctx;
      const taskId = this.getTaskIdFromContext(ctx);
      if (!taskId) return;
      this.markTaskRunning(taskId);
    },
    afterRun: async (
      ctx: PluginContext,
      params: { result: { text: string } },
    ): Promise<void> => {
      this.latestCtx = ctx;
      const taskId = this.getTaskIdFromContext(ctx);
      if (!taskId) return;
      this.markTaskCompleted(taskId, params.result.text);
    },
    onError: async (ctx: PluginContext, params: { error: unknown }): Promise<void> => {
      const taskId = this.getTaskIdFromContext(ctx);
      if (!taskId) return;
      this.markTaskFailed(taskId, params.error);
    },
  };

  constructor(options: A2APluginOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("A2APlugin requires a fetch implementation");
    }

    this.fetchImpl = fetchImpl;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.agentCardProvider = options.agentCardProvider;

    this.tools = {
      "a2a:call": tool({
        description: "Call an external A2A-compatible JSON-RPC endpoint.",
        inputSchema: A2A_CALL_SCHEMA,
        execute: async (input: unknown) => {
          const args = A2A_CALL_SCHEMA.parse(input ?? {});

          const params = this.normalizeCallParams(args);
          const payload: A2AJsonRpcRequest = {
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: args.method,
            params,
          };

          const response = await this.callRemoteEndpoint(args.endpoint, payload);

          if (response.error) {
            throw new Error(
              `[A2A ${response.error.code}] ${response.error.message}`,
            );
          }

          return response.result;
        },
      }),
    };
  }

  setup(ctx: PluginSetupContext): void {
    this.setupCtx = ctx;
  }

  createJsonRpcHandler(
    agent: A2AAgentRuntime,
  ): (request: A2AJsonRpcRequest) => Promise<A2AJsonRpcResponse> {
    return createA2AJsonRpcHandler({
      sendTask: async (params) => {
        const taskId = params.taskId ?? crypto.randomUUID();
        this.queueTask(taskId, params.prompt, params.metadata);

        try {
          const runMetadata: Record<string, unknown> = {
            ...(params.metadata ?? {}),
            a2aTaskId: taskId,
          };

          const result = await agent.run(params.prompt, { pluginMetadata: runMetadata });

          const task = this.tasks.get(taskId);
          if (task && (task.status === "queued" || task.status === "running")) {
            this.markTaskCompleted(taskId, result.text);
          }
        } catch (error) {
          const task = this.tasks.get(taskId);
          if (task && task.status !== "failed") {
            this.markTaskFailed(taskId, error);
          }
        }

        return this.cloneTask(taskId);
      },
      getTask: async (taskId) => {
        const task = this.tasks.get(taskId);
        return task ? this.cloneTask(task.id) : null;
      },
      listTasks: async () => {
        return [...this.tasks.values()].map((task) => this.cloneTask(task.id));
      },
      cancelTask: async (taskId) => {
        const task = this.tasks.get(taskId);
        if (!task) return null;

        if (task.status !== "completed" && task.status !== "failed") {
          const now = new Date().toISOString();
          task.status = "cancelled";
          task.updatedAt = now;
          task.completedAt = now;
        }

        return this.cloneTask(taskId);
      },
      getAgentCard: async () => {
        return this.resolveAgentCard();
      },
    });
  }

  createHttpHandler(agent: A2AAgentRuntime): (request: Request) => Promise<Response> {
    return createA2AHttpHandler(this.createJsonRpcHandler(agent));
  }

  getTask(taskId: string): A2ATask | null {
    const task = this.tasks.get(taskId);
    return task ? this.cloneTask(task.id) : null;
  }

  listTasks(): A2ATask[] {
    return [...this.tasks.values()].map((task) => this.cloneTask(task.id));
  }

  private normalizeCallParams(args: z.infer<typeof A2A_CALL_SCHEMA>): Record<string, unknown> {
    if (args.params) {
      return {
        ...args.params,
        ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
        ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
      };
    }

    if (args.method === "tasks/send") {
      if (!args.prompt) {
        throw new Error("a2a:call requires `prompt` for tasks/send requests");
      }
      return {
        prompt: args.prompt,
        ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
      };
    }

    if (args.method === "tasks/get" || args.method === "tasks/cancel") {
      if (!args.taskId) {
        throw new Error(`a2a:call requires \`taskId\` for ${args.method}`);
      }
      return { taskId: args.taskId };
    }

    return {};
  }

  private async callRemoteEndpoint(
    endpoint: string,
    payload: A2AJsonRpcRequest,
  ): Promise<A2AJsonRpcResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`A2A endpoint returned HTTP ${response.status}`);
      }

      const parsed = await response.json() as A2AJsonRpcResponse;
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  private queueTask(
    taskId: string,
    prompt: string,
    metadata?: Record<string, unknown>,
  ): void {
    const now = new Date().toISOString();
    this.tasks.set(taskId, {
      id: taskId,
      status: "queued",
      prompt,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  private markTaskRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "running";
    task.updatedAt = new Date().toISOString();
  }

  private markTaskCompleted(taskId: string, output: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const now = new Date().toISOString();
    task.status = "completed";
    task.output = output;
    task.updatedAt = now;
    task.completedAt = now;
    task.error = undefined;
  }

  private markTaskFailed(taskId: string, error: unknown): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const now = new Date().toISOString();
    task.status = "failed";
    task.error = error instanceof Error ? error.message : String(error);
    task.updatedAt = now;
    task.completedAt = now;
  }

  private getTaskIdFromContext(ctx: PluginContext): string | undefined {
    const raw = ctx.runMetadata?.a2aTaskId;
    return typeof raw === "string" && raw.length > 0 ? raw : undefined;
  }

  private async resolveAgentCard(): Promise<unknown> {
    if (this.agentCardProvider) {
      return this.agentCardProvider.getAgentCard();
    }

    const ctx = this.latestCtx ?? this.setupCtx;
    if (!ctx) {
      return {
        name: "DeepAgent",
        instructions: "",
        tools: [],
      };
    }

    return {
      name: ctx.agentName ?? "DeepAgent",
      sessionId: ctx.sessionId,
      instructions: ctx.config.instructions,
      maxSteps: ctx.config.maxSteps,
      tools: [...ctx.toolNames],
    };
  }

  private cloneTask(taskId: string): A2ATask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return {
      ...task,
      metadata: task.metadata ? { ...task.metadata } : undefined,
    };
  }
}

export function createA2APlugin(options?: A2APluginOptions): A2APlugin {
  return new A2APlugin(options);
}
