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
  createA2ASseHandler,
  type A2AJsonRpcRequest,
  type A2AJsonRpcResponse,
  type A2ATask,
  type A2ATaskEvent,
  type A2ATasksSendParams,
} from "./a2a-handler.js";
import type { AgentCardProvider } from "./agent-card.plugin.js";
import { A2ADelegationManager, type AgentCapability, type DelegationResult } from "./a2a-delegation.js";
import { A2APushNotifier, type PushNotificationConfig } from "./a2a-push.js";

/** Default timeout for outbound A2A requests in ms (30 seconds) */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

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

const A2A_DELEGATE_SCHEMA = z.object({
  prompt: z.string(),
  requiredSkills: z.array(z.string()).default([]),
});

const A2A_DISCOVER_SCHEMA = z.object({
  endpoint: z.string().url(),
});

const A2A_SUBSCRIBE_SCHEMA = z.object({
  endpoint: z.string().url(),
  prompt: z.string(),
  taskId: z.string().optional(),
});

export class A2APlugin implements DeepAgentPlugin {
  readonly name = "a2a";
  readonly version = "1.0.0";
  readonly tools: Record<string, Tool>;

  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly agentCardProvider?: AgentCardProvider;
  private readonly tasks = new Map<string, A2ATask>();
  private readonly completionTimestamps = new Map<string, number>();
  private readonly delegationManager: A2ADelegationManager;
  private readonly pushNotifier: A2APushNotifier;
  private readonly taskEventListeners = new Set<(event: A2ATaskEvent) => void>();
  private static readonly MAX_COMPLETED_TASKS = 1000;
  private static readonly TASK_TTL_MS = 3600_000; // 1 hour
  private evictionTimer?: ReturnType<typeof setInterval>;

  private setupCtx?: PluginSetupContext;
  private latestCtx?: PluginContext;

  readonly hooks = {
    beforeRun: async (ctx: PluginContext, _params: { prompt: string }): Promise<void> => {
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
    onError: async (
      ctx: PluginContext,
      params: { error: unknown; phase: "run" | "stream" | "tool" | "step" | "setup" },
    ): Promise<void> => {
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
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.agentCardProvider = options.agentCardProvider;
    this.delegationManager = new A2ADelegationManager(fetchImpl);
    this.pushNotifier = new A2APushNotifier(fetchImpl);
    this.evictionTimer = setInterval(() => this.evictStaleTasks(), 60_000);

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
      "a2a:delegate": tool({
        description: "Delegate a task to a registered agent based on required skills.",
        inputSchema: A2A_DELEGATE_SCHEMA,
        execute: async (input: unknown) => {
          const args = A2A_DELEGATE_SCHEMA.parse(input ?? {});
          return await this.delegationManager.delegate(args.prompt, args.requiredSkills, this.fetchImpl);
        },
      }),
      "a2a:discover": tool({
        description: "Discover agent capabilities at an A2A endpoint.",
        inputSchema: A2A_DISCOVER_SCHEMA,
        execute: async (input: unknown) => {
          const args = A2A_DISCOVER_SCHEMA.parse(input ?? {});
          return await this.discoverAgent(args.endpoint);
        },
      }),
      "a2a:subscribe": tool({
        description: "Subscribe to task status updates via Server-Sent Events.",
        inputSchema: A2A_SUBSCRIBE_SCHEMA,
        execute: async (input: unknown) => {
          const args = A2A_SUBSCRIBE_SCHEMA.parse(input ?? {});
          return await this.subscribeToTask(args.endpoint, args.prompt, args.taskId);
        },
      }),
    };
  }

  setup(ctx: PluginSetupContext): void {
    this.setupCtx = ctx;
  }

  dispose(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = undefined;
    }
  }

  createJsonRpcHandler(
    agent: A2AAgentRuntime,
  ): (request: A2AJsonRpcRequest) => Promise<A2AJsonRpcResponse> & { sendTaskSubscribe?: (params: A2ATasksSendParams) => AsyncGenerator<A2ATaskEvent, void, unknown> } {
    const plugin = this;
    
    const sendTaskSubscribe = async function* (params: A2ATasksSendParams): AsyncGenerator<A2ATaskEvent, void, unknown> {
      const taskId = params.taskId ?? crypto.randomUUID();
      
      const eventQueue: A2ATaskEvent[] = [];
      let completed = false;
      let pending: { promise: Promise<void>; resolve: () => void };
      
      function createDeferred(): { promise: Promise<void>; resolve: () => void } {
        let resolve!: () => void;
        const promise = new Promise<void>(r => { resolve = r; });
        return { promise, resolve };
      }
      pending = createDeferred();
      
      const eventListener = (event: A2ATaskEvent) => {
        if (event.taskId === taskId) {
          eventQueue.push(event);
          if (event.type === 'task:completed' || event.type === 'task:failed' || event.type === 'task:cancelled') {
            completed = true;
          }
          pending.resolve();
          pending = createDeferred();
        }
      };
      
      // Register listener before queueTask so task:queued event is captured
      plugin.taskEventListeners.add(eventListener);
      plugin.queueTask(taskId, params.prompt, params.metadata);
      
      try {
        const runMetadata: Record<string, unknown> = {
          ...(params.metadata ?? {}),
          a2aTaskId: taskId,
        };

        // Start the task
        plugin.markTaskRunning(taskId);
        
        const runPromise = agent.run(params.prompt, { pluginMetadata: runMetadata })
          .then(result => {
            const task = plugin.tasks.get(taskId);
            if (task && (task.status === "queued" || task.status === "running")) {
              plugin.markTaskCompleted(taskId, result.text);
            }
          })
          .catch(error => {
            const task = plugin.tasks.get(taskId);
            if (task && task.status !== "failed") {
              plugin.markTaskFailed(taskId, error);
            }
          });

        // Yield events as they arrive via deferred promises
        let lastEventIndex = 0;
        while (!completed) {
          if (eventQueue.length <= lastEventIndex) {
            await pending.promise;
          }
          for (let i = lastEventIndex; i < eventQueue.length; i++) {
            yield eventQueue[i];
          }
          lastEventIndex = eventQueue.length;
        }
        
        // Wait for task completion
        await runPromise;
        
        // Yield any remaining events
        if (eventQueue.length > lastEventIndex) {
          for (let i = lastEventIndex; i < eventQueue.length; i++) {
            yield eventQueue[i];
          }
        }
        
      } finally {
        plugin.taskEventListeners.delete(eventListener);
      }
    };

    const jsonRpcHandler = createA2AJsonRpcHandler({
      sendTask: async (params) => {
        const taskId = params.taskId ?? crypto.randomUUID();
        plugin.queueTask(taskId, params.prompt, params.metadata);

        try {
          plugin.markTaskRunning(taskId);
          
          const runMetadata: Record<string, unknown> = {
            ...(params.metadata ?? {}),
            a2aTaskId: taskId,
          };

          const result = await agent.run(params.prompt, { pluginMetadata: runMetadata });

          const task = plugin.tasks.get(taskId);
          if (task && (task.status === "queued" || task.status === "running")) {
            plugin.markTaskCompleted(taskId, result.text);
          }
        } catch (error) {
          const task = plugin.tasks.get(taskId);
          if (task && task.status !== "failed") {
            plugin.markTaskFailed(taskId, error);
          }
        }

        return plugin.cloneTask(taskId);
      },
      sendTaskSubscribe,
      getTask: async (taskId) => {
        const task = plugin.tasks.get(taskId);
        return task ? plugin.cloneTask(task.id) : null;
      },
      listTasks: async () => {
        return [...plugin.tasks.values()].map((task) => plugin.cloneTask(task.id));
      },
      cancelTask: async (taskId) => {
        const task = plugin.tasks.get(taskId);
        if (!task) return null;

        if (task.status !== "completed" && task.status !== "failed") {
          const now = new Date().toISOString();
          task.status = "cancelled";
          task.updatedAt = now;
          task.completedAt = now;
          plugin.completionTimestamps.set(taskId, Date.now());
          plugin.emitTaskEvent("task:cancelled", taskId);
        }

        return plugin.cloneTask(taskId);
      },
      getAgentCard: async () => {
        return plugin.resolveAgentCard();
      },
    });

    // Expose sendTaskSubscribe for direct access
    (jsonRpcHandler as any).sendTaskSubscribe = sendTaskSubscribe;
    
    return jsonRpcHandler as any;
  }

  createHttpHandler(agent: A2AAgentRuntime): (request: Request) => Promise<Response> {
    const handler = this.createJsonRpcHandler(agent) as any;
    return createA2AHttpHandler(handler, {
      sendTaskSubscribe: async function* (params: A2ATasksSendParams): AsyncGenerator<A2ATaskEvent, void, unknown> {
        for await (const event of handler.sendTaskSubscribe(params)) {
          yield event;
        }
      }
    });
  }

  getTask(taskId: string): A2ATask | null {
    const task = this.tasks.get(taskId);
    return task ? this.cloneTask(task.id) : null;
  }

  listTasks(): A2ATask[] {
    return [...this.tasks.values()].map((task) => this.cloneTask(task.id));
  }

  // Delegation methods
  registerAgent(agent: AgentCapability): void {
    this.delegationManager.register(agent);
  }

  unregisterAgent(name: string): void {
    this.delegationManager.unregister(name);
  }

  listAgents(): AgentCapability[] {
    return this.delegationManager.listAgents();
  }

  async delegateTask(prompt: string, requiredSkills: string[]): Promise<DelegationResult> {
    return await this.delegationManager.delegate(prompt, requiredSkills, this.fetchImpl);
  }

  // Push notification methods
  subscribeToTaskNotifications(taskId: string, config: PushNotificationConfig): void {
    this.pushNotifier.subscribe(taskId, config);
  }

  unsubscribeFromTaskNotifications(taskId: string, url: string): void {
    this.pushNotifier.unsubscribe(taskId, url);
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
    if (this.tasks.size >= A2APlugin.MAX_COMPLETED_TASKS) {
      this.evictStaleTasks();
    }
    if (this.tasks.size >= A2APlugin.MAX_COMPLETED_TASKS) {
      throw new Error('Task queue at capacity. Try again later.');
    }
    const now = new Date().toISOString();
    this.tasks.set(taskId, {
      id: taskId,
      status: "queued",
      prompt,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
    this.emitTaskEvent("task:queued", taskId);
  }

  private markTaskRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "running";
    task.updatedAt = new Date().toISOString();
    this.emitTaskEvent("task:running", taskId);
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
    this.completionTimestamps.set(taskId, Date.now());
    this.emitTaskEvent("task:completed", taskId);
  }

  private markTaskFailed(taskId: string, error: unknown): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const now = new Date().toISOString();
    task.status = "failed";
    task.error = error instanceof Error ? error.message : String(error);
    task.updatedAt = now;
    task.completedAt = now;
    this.completionTimestamps.set(taskId, Date.now());
    this.emitTaskEvent("task:failed", taskId);
  }

  private evictStaleTasks(): void {
    const now = Date.now();
    for (const [id, ts] of this.completionTimestamps) {
      if (now - ts > A2APlugin.TASK_TTL_MS) {
        this.tasks.delete(id);
        this.completionTimestamps.delete(id);
        this.pushNotifier.cleanup(id);
      }
    }

    // Evict orphaned running/queued tasks older than 2x TTL
    const orphanThreshold = A2APlugin.TASK_TTL_MS * 2;
    for (const [id, task] of this.tasks) {
      if (
        (task.status === "running" || task.status === "queued") &&
        now - new Date(task.createdAt).getTime() > orphanThreshold
      ) {
        this.tasks.delete(id);
        this.completionTimestamps.delete(id);
      }
    }
  }

  private emitTaskEvent(type: A2ATaskEvent['type'], taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const event: A2ATaskEvent = {
      type,
      taskId,
      task: this.cloneTask(taskId),
      timestamp: new Date().toISOString()
    };

    // Emit to event listeners
    for (const listener of this.taskEventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn("Task event listener error:", error);
      }
    }

    // Send push notifications
    this.pushNotifier.notify(event).catch(error => {
      console.warn("Push notification error:", error);
    });
  }

  private async discoverAgent(endpoint: string): Promise<AgentCapability> {
    try {
      const discoveryUrl = new URL('/.well-known/agent.json', endpoint).toString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const discoveryResponse = await this.fetchImpl(discoveryUrl, { signal: controller.signal });
        if (discoveryResponse.ok) {
          const discoveryData = await discoveryResponse.json() as any;
          return {
            name: discoveryData.name,
            description: discoveryData.description,
            skills: discoveryData.skills?.map((s: any) => s.name) ?? [],
            endpoint: endpoint
          };
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Fall back to agent/card method
    }

    // Fallback to JSON-RPC agent/card
    const payload: A2AJsonRpcRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "agent/card"
    };

    const response = await this.callRemoteEndpoint(endpoint, payload);
    
    if (response.error) {
      throw new Error(`Failed to discover agent: ${response.error.message}`);
    }

    const card = response.result as any;
    return {
      name: card?.name ?? "Unknown Agent",
      description: card?.instructions ?? "No description",
      skills: card?.tools ?? [],
      endpoint: endpoint
    };
  }

  private async subscribeToTask(endpoint: string, prompt: string, taskId?: string): Promise<{ message: string; events: A2ATaskEvent[] }> {
    const sseUrl = endpoint; // SSE endpoint is same as JSON-RPC endpoint
    const payload = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/sendSubscribe",
      params: { prompt, taskId }
    };

    // SSE streams get 5x the normal timeout
    const sseTimeoutMs = this.requestTimeoutMs * 5;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), sseTimeoutMs);

    try {
    const response = await this.fetchImpl(sseUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`SSE subscription failed with HTTP ${response.status}`);
    }

    const events: A2ATaskEvent[] = [];
    let sseCompleted = false;
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body for SSE stream");
    }

    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const segments = buffer.split('\n');
        // Last segment may be incomplete — keep it in buffer
        buffer = segments.pop() ?? '';
        
        for (const line of segments) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.substring(6));
              events.push(eventData);
              if (eventData.type === 'task:completed' || eventData.type === 'task:failed' || eventData.type === 'task:cancelled') {
                sseCompleted = true;
              }
            } catch {
              // Ignore invalid JSON
            }
          }
        }
        
        // Break on completion/failure
        if (sseCompleted) {
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { 
      message: "Task subscription completed",
      events 
    };
    } finally {
      clearTimeout(timer);
    }
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
