// =============================================================================
// A2APlugin — A2A server integration + remote A2A call tool
// =============================================================================

import { tool, type Tool } from "../core/llm/index.js";
import { z } from "zod";

import type { AgentResult, AgentRunOptions } from "../agent/agent.js";
import type {
  Plugin,
  PluginContext,
  PluginSetupContext,
} from "../ports/plugin.port.js";
import {
  createA2AHttpHandler,
  createA2AJsonRpcHandler,
  type A2AJsonRpcRequest,
  type A2AJsonRpcResponse,
  type A2ATask,
  type A2ATaskEvent,
  type A2ATasksSendParams,
} from "./a2a-handler.js";
import type { AgentCardProvider } from "./agent-card.plugin.js";
import { A2ADelegationManager, type AgentCapability, type DelegationResult } from "./a2a-delegation.js";
import { A2APushNotifier, type PushNotificationConfig } from "./a2a-push.js";
import {
  A2ADurableTaskQueue,
  type A2ATaskLease,
  type A2ATaskQueueConfig,
  type A2ATaskQueueSnapshot,
  type A2ATaskRetryConfig,
} from "./a2a-durable-task-queue.js";

/** Default timeout for outbound A2A requests in ms (30 seconds) */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_CONFIG: A2ATaskRetryConfig = {
  maxAttempts: 3,
  initialBackoffMs: 250,
  backoffMultiplier: 2,
  maxBackoffMs: 30_000,
  jitterRatio: 0,
};

export interface A2AAgentRuntime {
  sessionId: string;
  run(prompt: string, options?: AgentRunOptions): Promise<AgentResult>;
}

export interface A2APluginOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  agentCardProvider?: AgentCardProvider;
  retry?: Partial<A2ATaskRetryConfig>;
  queue?: Partial<Pick<A2ATaskQueueConfig, "leaseDurationMs" | "retentionMs" | "maxTerminalTasks">>;
  taskQueue?: A2ADurableTaskQueue;
  persistQueueState?: boolean;
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

export class A2APlugin implements Plugin {
  readonly name = "a2a";
  readonly version = "1.0.0";
  readonly tools: Record<string, Tool>;

  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly agentCardProvider?: AgentCardProvider;
  private readonly taskQueue: A2ADurableTaskQueue;
  private readonly persistQueueStateEnabled: boolean;
  private readonly delegationManager: A2ADelegationManager;
  private readonly pushNotifier: A2APushNotifier;
  private readonly taskEventListeners = new Set<(event: A2ATaskEvent) => void>();

  private static readonly QUEUE_SNAPSHOT_KEY = "a2a:durable-task-queue:v1";
  private static readonly DEFAULT_MAX_TERMINAL_TASKS = 1000;
  private static readonly DEFAULT_RETENTION_MS = 3_600_000; // 1 hour

  private evictionTimer?: ReturnType<typeof setInterval>;
  private queueHydrated = false;
  private queueHydrationPromise: Promise<void> | null = null;

  private setupCtx?: PluginSetupContext;
  private latestCtx?: PluginContext;

  readonly hooks = {
    beforeRun: async (ctx: PluginContext, _params: { prompt: string }): Promise<void> => {
      this.latestCtx = ctx;
      if (this.isQueueManagedRun(ctx)) return;
      const taskId = this.getTaskIdFromContext(ctx);
      if (!taskId) return;
      this.markTaskRunning(taskId, this.getLeaseIdFromContext(ctx));
    },
    afterRun: async (
      ctx: PluginContext,
      params: { result: { text: string } },
    ): Promise<void> => {
      this.latestCtx = ctx;
      if (this.isQueueManagedRun(ctx)) return;
      const taskId = this.getTaskIdFromContext(ctx);
      if (!taskId) return;
      this.markTaskCompleted(taskId, params.result.text, this.getLeaseIdFromContext(ctx));
    },
    onError: async (
      ctx: PluginContext,
      params: { error: unknown; phase: "run" | "stream" | "tool" | "step" | "setup" },
    ): Promise<void> => {
      if (this.isQueueManagedRun(ctx)) return;
      const taskId = this.getTaskIdFromContext(ctx);
      if (!taskId) return;
      this.markTaskFailed(taskId, params.error, this.getLeaseIdFromContext(ctx));
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
    this.persistQueueStateEnabled = options.persistQueueState ?? true;
    this.delegationManager = new A2ADelegationManager(fetchImpl);
    this.pushNotifier = new A2APushNotifier(fetchImpl);

    const normalizedRetry: A2ATaskRetryConfig | undefined = options.retry
      ? {
          maxAttempts: options.retry.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
          initialBackoffMs: options.retry.initialBackoffMs ?? DEFAULT_RETRY_CONFIG.initialBackoffMs,
          backoffMultiplier: options.retry.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
          maxBackoffMs: options.retry.maxBackoffMs ?? DEFAULT_RETRY_CONFIG.maxBackoffMs,
          jitterRatio: options.retry.jitterRatio ?? DEFAULT_RETRY_CONFIG.jitterRatio,
        }
      : undefined;

    this.taskQueue = options.taskQueue ?? new A2ADurableTaskQueue({
      leaseDurationMs: options.queue?.leaseDurationMs,
      retentionMs: options.queue?.retentionMs ?? A2APlugin.DEFAULT_RETENTION_MS,
      maxTerminalTasks: options.queue?.maxTerminalTasks ?? A2APlugin.DEFAULT_MAX_TERMINAL_TASKS,
      retry: normalizedRetry,
    });

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
            throw new Error(`[A2A ${response.error.code}] ${response.error.message}`);
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
    void this.ensureQueueHydrated();
  }

  dispose(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = undefined;
    }
    void this.persistQueueState();
  }

  createJsonRpcHandler(
    agent: A2AAgentRuntime,
  ): (request: A2AJsonRpcRequest) => Promise<A2AJsonRpcResponse> & { sendTaskSubscribe?: (params: A2ATasksSendParams) => AsyncGenerator<A2ATaskEvent, void, unknown> } {
    const plugin = this;

    const sendTaskSubscribe = async function* (params: A2ATasksSendParams): AsyncGenerator<A2ATaskEvent, void, unknown> {
      await plugin.ensureQueueHydrated();
      const taskId = params.taskId ?? crypto.randomUUID();

      const eventQueue: A2ATaskEvent[] = [];
      let completed = false;
      let pending: { promise: Promise<void>; resolve: () => void };

      function createDeferred(): { promise: Promise<void>; resolve: () => void } {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        return { promise, resolve };
      }
      pending = createDeferred();

      const eventListener = (event: A2ATaskEvent) => {
        if (event.taskId === taskId) {
          eventQueue.push(event);
          if (event.type === "task:completed" || event.type === "task:failed" || event.type === "task:cancelled") {
            completed = true;
          }
          pending.resolve();
          pending = createDeferred();
        }
      };

      plugin.taskEventListeners.add(eventListener);
      plugin.queueTask(taskId, params.prompt, params.metadata);

      try {
        const runPromise = plugin.executeTaskWithRetry(agent, taskId, params);

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

        await runPromise;

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
        await plugin.ensureQueueHydrated();
        const taskId = params.taskId ?? crypto.randomUUID();
        plugin.queueTask(taskId, params.prompt, params.metadata);
        await plugin.executeTaskWithRetry(agent, taskId, params);
        return plugin.cloneTask(taskId);
      },
      sendTaskSubscribe,
      getTask: async (taskId) => {
        await plugin.ensureQueueHydrated();
        return plugin.getTask(taskId);
      },
      listTasks: async () => {
        await plugin.ensureQueueHydrated();
        return plugin.listTasks();
      },
      cancelTask: async (taskId) => {
        await plugin.ensureQueueHydrated();

        const previous = plugin.taskQueue.get(taskId);
        if (!previous) return null;

        const cancelled = plugin.taskQueue.cancel(taskId);
        if (!cancelled) return null;

        if (previous.status !== "cancelled" && previous.status !== "completed" && previous.status !== "failed") {
          plugin.emitTaskEvent("task:cancelled", taskId);
        }
        void plugin.persistQueueState();
        return cancelled;
      },
      getAgentCard: async () => {
        return plugin.resolveAgentCard();
      },
    });

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
      },
    });
  }

  getTask(taskId: string): A2ATask | null {
    return this.taskQueue.get(taskId);
  }

  listTasks(): A2ATask[] {
    return this.taskQueue.list();
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

      return await response.json() as A2AJsonRpcResponse;
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
    this.taskQueue.enqueue({
      id: taskId,
      status: "queued",
      prompt,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
    this.emitTaskEvent("task:queued", taskId);
    void this.persistQueueState();
  }

  private markTaskRunning(taskId: string, _leaseId?: string): A2ATaskLease | null {
    const lease = this.taskQueue.acquire(taskId, this.createWorkerId(taskId));
    if (!lease) return null;
    this.emitTaskEvent("task:running", taskId);
    void this.persistQueueState();
    return lease;
  }

  private markTaskCompleted(taskId: string, output: string, leaseId?: string): void {
    const before = this.taskQueue.get(taskId);
    const completed = this.taskQueue.complete(taskId, output, leaseId);
    if (!completed) return;

    if (before?.status !== "completed") {
      this.emitTaskEvent("task:completed", taskId);
    }
    void this.persistQueueState();
  }

  private markTaskFailed(taskId: string, error: unknown, leaseId?: string): void {
    const result = this.taskQueue.fail(taskId, this.normalizeError(error), leaseId);
    if (!result) return;

    if (result.willRetry) {
      this.emitTaskEvent("task:queued", taskId);
    } else {
      this.emitTaskEvent("task:failed", taskId);
    }
    void this.persistQueueState();
  }

  private async executeTaskWithRetry(
    agent: A2AAgentRuntime,
    taskId: string,
    params: A2ATasksSendParams,
  ): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const task = this.taskQueue.get(taskId);
      if (!task || task.status === "cancelled" || task.status === "completed" || task.status === "failed") {
        return;
      }

      const lease = this.markTaskRunning(taskId);
      if (!lease) {
        await this.sleep(10);
        continue;
      }

      const runMetadata: Record<string, unknown> = {
        ...(params.metadata ?? {}),
        a2aTaskId: taskId,
        a2aLeaseId: lease.leaseId,
        a2aAttempt: lease.attempt,
        a2aManagedByQueue: true,
      };

      try {
        const result = await agent.run(params.prompt, { pluginMetadata: runMetadata });
        this.markTaskCompleted(taskId, result.text, lease.leaseId);
        return;
      } catch (error) {
        const failed = this.taskQueue.fail(taskId, this.normalizeError(error), lease.leaseId);
        if (!failed) return;

        if (!failed.willRetry) {
          this.emitTaskEvent("task:failed", taskId);
          void this.persistQueueState();
          return;
        }

        this.emitTaskEvent("task:queued", taskId);
        void this.persistQueueState();
        await this.sleep(failed.retryDelayMs);
      }
    }
  }

  private evictStaleTasks(): void {
    const before = new Set(this.taskQueue.list().map((task) => task.id));
    this.taskQueue.evictExpired();
    const after = new Set(this.taskQueue.list().map((task) => task.id));

    for (const taskId of before) {
      if (!after.has(taskId)) {
        this.pushNotifier.cleanup(taskId);
      }
    }

    void this.persistQueueState();
  }

  private emitTaskEvent(type: A2ATaskEvent["type"], taskId: string): void {
    const task = this.taskQueue.get(taskId);
    if (!task) return;

    const event: A2ATaskEvent = {
      type,
      taskId,
      task,
      timestamp: new Date().toISOString(),
    };

    for (const listener of this.taskEventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn("Task event listener error:", error);
      }
    }

    this.pushNotifier.notify(event).catch((error) => {
      console.warn("Push notification error:", error);
    });
  }

  private createWorkerId(taskId: string): string {
    const sessionId = this.latestCtx?.sessionId ?? this.setupCtx?.sessionId ?? "a2a";
    return `${sessionId}:${taskId}`;
  }

  private normalizeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async ensureQueueHydrated(): Promise<void> {
    if (this.queueHydrated) return;
    if (this.queueHydrationPromise) {
      await this.queueHydrationPromise;
      return;
    }

    this.queueHydrationPromise = this.hydrateQueueFromMemory();
    try {
      await this.queueHydrationPromise;
      this.queueHydrated = true;
    } finally {
      this.queueHydrationPromise = null;
    }
  }

  private async hydrateQueueFromMemory(): Promise<void> {
    if (!this.persistQueueStateEnabled || !this.setupCtx) return;

    try {
      const snapshot = await this.setupCtx.memory.loadMetadata<A2ATaskQueueSnapshot>(
        this.setupCtx.sessionId,
        A2APlugin.QUEUE_SNAPSHOT_KEY,
      );

      if (snapshot) {
        this.taskQueue.hydrate(snapshot);
      }
    } catch (error) {
      console.warn("A2A queue hydration failed:", error);
    }
  }

  private async persistQueueState(): Promise<void> {
    if (!this.persistQueueStateEnabled || !this.setupCtx) return;

    try {
      await this.setupCtx.memory.saveMetadata(
        this.setupCtx.sessionId,
        A2APlugin.QUEUE_SNAPSHOT_KEY,
        this.taskQueue.snapshot(),
      );
    } catch (error) {
      console.warn("A2A queue persistence failed:", error);
    }
  }

  private sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async discoverAgent(endpoint: string): Promise<AgentCapability> {
    try {
      const discoveryUrl = new URL("/.well-known/agent.json", endpoint).toString();
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
            endpoint,
          };
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Fall back to JSON-RPC agent/card.
    }

    const payload: A2AJsonRpcRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "agent/card",
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
      endpoint,
    };
  }

  private async subscribeToTask(endpoint: string, prompt: string, taskId?: string): Promise<{ message: string; events: A2ATaskEvent[] }> {
    const payload = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/sendSubscribe",
      params: { prompt, taskId },
    };

    // SSE streams get 5x the normal timeout
    const sseTimeoutMs = this.requestTimeoutMs * 5;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), sseTimeoutMs);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
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

      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const segments = buffer.split("\n");
          buffer = segments.pop() ?? "";

          for (const line of segments) {
            if (line.startsWith("data: ")) {
              try {
                const eventData = JSON.parse(line.substring(6));
                events.push(eventData);
                if (eventData.type === "task:completed" || eventData.type === "task:failed" || eventData.type === "task:cancelled") {
                  sseCompleted = true;
                }
              } catch {
                // Ignore malformed event payloads.
              }
            }
          }

          if (sseCompleted) {
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }

      return {
        message: "Task subscription completed",
        events,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private getTaskIdFromContext(ctx: PluginContext): string | undefined {
    const raw = ctx.runMetadata?.a2aTaskId;
    return typeof raw === "string" && raw.length > 0 ? raw : undefined;
  }

  private getLeaseIdFromContext(ctx: PluginContext): string | undefined {
    const raw = ctx.runMetadata?.a2aLeaseId;
    return typeof raw === "string" && raw.length > 0 ? raw : undefined;
  }

  private isQueueManagedRun(ctx: PluginContext): boolean {
    return ctx.runMetadata?.a2aManagedByQueue === true;
  }

  private async resolveAgentCard(): Promise<unknown> {
    if (this.agentCardProvider) {
      return this.agentCardProvider.getAgentCard();
    }

    const ctx = this.latestCtx ?? this.setupCtx;
    if (!ctx) {
      return {
        name: "Agent",
        instructions: "",
        tools: [],
      };
    }

    return {
      name: ctx.agentName ?? "Agent",
      sessionId: ctx.sessionId,
      instructions: ctx.config.instructions,
      maxSteps: ctx.config.maxSteps,
      tools: [...ctx.toolNames],
    };
  }

  private cloneTask(taskId: string): A2ATask {
    const task = this.taskQueue.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }
}

export function createA2APlugin(options?: A2APluginOptions): A2APlugin {
  return new A2APlugin(options);
}
