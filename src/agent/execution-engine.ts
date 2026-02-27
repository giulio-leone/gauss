// =============================================================================
// ExecutionEngine — Run & stream orchestration
// =============================================================================

import { ToolLoopAgent, stepCountIs } from "ai";
import type { LanguageModel, Tool } from "ai";

import type { MemoryPort } from "../ports/memory.port.js";
import type { LearningPort } from "../ports/learning.port.js";
import type { CheckpointConfig, DelegationHooks } from "../types.js";
import type { PluginContext, PluginRunMetadata } from "../ports/plugin.port.js";
import type { RuntimePort } from "../ports/runtime.port.js";
import type { CostTrackerPort } from "../ports/cost-tracker.port.js";
import type { UserProfile, UserMemory } from "../domain/learning.schema.js";
import type { TelemetryPort } from "../ports/telemetry.port.js";

import type { EventBus } from "./event-bus.js";
import type { ToolManager } from "./tool-manager.js";
import { PluginManager } from "../plugins/plugin-manager.js";
import { TokenTracker } from "../context/token-tracker.js";

import type { DeepAgentResult, DeepAgentRunOptions } from "./deep-agent.js";

// =============================================================================
// Config subset needed by ExecutionEngine
// =============================================================================

export interface ExecutionEngineConfig {
  model: LanguageModel;
  instructions: string;
  maxSteps: number;
  memory: MemoryPort;
  learning?: LearningPort;
  userId?: string;
  delegationHooks?: DelegationHooks;
  checkpointConfig?: Required<CheckpointConfig>;
  telemetry?: TelemetryPort;
  costTracker?: CostTrackerPort;
  /** AI SDK Output specification for structured output (passthrough to ToolLoopAgent). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
}

// =============================================================================
// ExecutionEngine
// =============================================================================

export class ExecutionEngine {
  private readonly config: ExecutionEngineConfig;
  private readonly toolManager: ToolManager;
  private readonly pluginManager: PluginManager;
  private readonly eventBus: EventBus;
  private readonly tokenTracker: TokenTracker;

  constructor(
    config: ExecutionEngineConfig,
    toolManager: ToolManager,
    pluginManager: PluginManager,
    eventBus: EventBus,
    tokenTracker: TokenTracker,
  ) {
    this.config = config;
    this.toolManager = toolManager;
    this.pluginManager = pluginManager;
    this.eventBus = eventBus;
    this.tokenTracker = tokenTracker;
  }

  // ---------------------------------------------------------------------------
  // Telemetry helper — DRY span lifecycle (try/catch/finally)
  // ---------------------------------------------------------------------------

  private isDelegationTool(toolName: string): boolean {
    return (
      toolName === "dispatch_subagent" ||
      toolName === "poll_subagent" ||
      toolName === "await_subagent"
    );
  }

  private async applyDelegationMessageFilter(params: {
    direction: "tool:call" | "tool:result";
    toolName: string;
    stepIndex: number;
    payload: unknown;
  }): Promise<{ allow: boolean; payload: unknown; reason?: string }> {
    const hook = this.config.delegationHooks?.messageFilter;
    if (!hook || !this.isDelegationTool(params.toolName)) {
      return {
        allow: true,
        payload: params.payload,
      };
    }

    try {
      const filtered = await hook(params);
      if (typeof filtered === "boolean") {
        return {
          allow: filtered,
          payload: params.payload,
        };
      }
      if (!filtered) {
        return {
          allow: true,
          payload: params.payload,
        };
      }

      return {
        allow: filtered.allow !== false,
        payload:
          filtered.payload !== undefined
            ? filtered.payload
            : params.payload,
        reason: filtered.reason,
      };
    } catch {
      // Filtering failures should not break execution flow.
      return {
        allow: true,
        payload: params.payload,
      };
    }
  }

  private async withSpan<T>(name: string, attrs: Record<string, string | number | boolean>, fn: () => Promise<T>): Promise<T> {
    const span = this.config.telemetry?.startSpan(name, attrs);
    try {
      const result = await fn();
      span?.setStatus("OK");
      return result;
    } catch (error) {
      span?.setStatus("ERROR", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      span?.end();
    }
  }

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  async run(
    prompt: string,
    sessionId: string,
    runtime: RuntimePort,
    options: DeepAgentRunOptions = {},
  ): Promise<DeepAgentResult> {
    let pluginCtx = this.toolManager.createPluginContext(sessionId, [], options.pluginMetadata);

    try {
      const prepared = await this.toolManager.prepareTools(
        sessionId,
        this.eventBus,
        runtime,
        options.pluginMetadata,
      );
      const tools = prepared.tools;
      pluginCtx = prepared.pluginCtx;

      // Inject learning context if available
      if (this.config.learning) {
        const userId = this.config.userId ?? sessionId;
        const [profile, memories] = await Promise.all([
          this.config.learning.getProfile(userId),
          this.config.learning.getMemories(userId, { limit: 10 }),
        ]);
        const learningContext = this.buildLearningContext(profile, memories);
        if (learningContext) prompt = `${learningContext}\n\n${prompt}`;
      }

      const beforeRunResult = await this.pluginManager.runBeforeRun(pluginCtx, { prompt });
      if (beforeRunResult.prompt !== undefined) {
        prompt = beforeRunResult.prompt;
      }

      this.eventBus.emit("agent:start", { prompt });

      const cpConfig = this.config.checkpointConfig;
      if (cpConfig?.enabled) {
        const cp = await this.config.memory.loadLatestCheckpoint(sessionId);
        if (cp) this.eventBus.emit("checkpoint:load", { checkpoint: cp });
      }

      const agentOptions: Record<string, unknown> = {
        model: this.toolManager.createRateLimitedModel(),
        instructions: this.config.instructions,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps),
      };
      if (this.config.output) agentOptions.output = this.config.output;

      const agent = new ToolLoopAgent(agentOptions as ConstructorParameters<typeof ToolLoopAgent>[0]);

      // Wrap LLM call in telemetry span (safe on exception via withSpan)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await this.withSpan("llm.generate", { "llm.model": String(this.config.model) }, () =>
        (agent as any).generate({ prompt }),
      );

      // Track token usage
      const resultObj = result as unknown as { usage?: { promptTokens?: number; completionTokens?: number } };
      const usage = resultObj.usage;
      if (usage) {
        if (usage.promptTokens) {
          this.tokenTracker.addInput(usage.promptTokens);
          this.config.telemetry?.recordMetric("llm.tokens.input", usage.promptTokens);
        }
        if (usage.completionTokens) {
          this.tokenTracker.addOutput(usage.completionTokens);
          this.config.telemetry?.recordMetric("llm.tokens.output", usage.completionTokens);
        }

        // Record cost tracking if available
        if (this.config.costTracker && (usage.promptTokens || usage.completionTokens)) {
          const modelId = (this.config.model as unknown as { modelId?: string }).modelId ?? "unknown";
          const provider = (this.config.model as unknown as { provider?: string }).provider ?? "unknown";
          this.config.costTracker.recordUsage({
            inputTokens: usage.promptTokens ?? 0,
            outputTokens: usage.completionTokens ?? 0,
            model: modelId,
            provider,
            timestamp: Date.now(),
          });
        }
      }

      const steps = (result.steps ?? []) as unknown[];
      for (let i = 0; i < steps.length; i++) {
        let step = steps[i];
        const stepObj = step as Record<string, unknown> | undefined;
        const toolName = (stepObj?.toolName as string) ?? `step.${i}`;
        const toolSpanStart = Date.now();

        try {
          await this.withSpan(`tool.${toolName}`, { "tool.name": toolName, "step.index": i }, async () => {
            const beforeStepResult = await this.pluginManager.runBeforeStep(pluginCtx, {
              stepIndex: i,
              step,
            });

            if (beforeStepResult.skip) return;
            if (beforeStepResult.step !== undefined) {
              step = beforeStepResult.step;
              steps[i] = step;
            }

            this.eventBus.emit("step:start", { stepIndex: i, step });

            // Emit tool:call for each tool call in this step
            const toolCalls = (stepObj?.toolCalls as Array<{ toolName: string; toolCallId?: string; args?: unknown }>) ?? [];
            for (const tc of toolCalls) {
              const filtered = await this.applyDelegationMessageFilter({
                direction: "tool:call",
                toolName: tc.toolName,
                stepIndex: i,
                payload: tc.args,
              });

              if (!filtered.allow) {
                this.eventBus.emit("delegation:message-filtered", {
                  direction: "tool:call",
                  toolName: tc.toolName,
                  stepIndex: i,
                  reason: filtered.reason,
                });
                continue;
              }

              this.eventBus.emit("tool:call", {
                toolName: tc.toolName,
                toolCallId: tc.toolCallId,
                args: filtered.payload,
                stepIndex: i,
              });
            }

            // Emit tool:result for each tool result in this step
            const toolResults = (stepObj?.toolResults as Array<{ toolName: string; toolCallId?: string; result?: unknown }>) ?? [];
            for (const tr of toolResults) {
              const filtered = await this.applyDelegationMessageFilter({
                direction: "tool:result",
                toolName: tr.toolName,
                stepIndex: i,
                payload: tr.result,
              });

              if (!filtered.allow) {
                this.eventBus.emit("delegation:message-filtered", {
                  direction: "tool:result",
                  toolName: tr.toolName,
                  stepIndex: i,
                  reason: filtered.reason,
                });
                continue;
              }

              this.eventBus.emit("tool:result", {
                toolName: tr.toolName,
                toolCallId: tr.toolCallId,
                result: filtered.payload,
                stepIndex: i,
              });
            }

            this.eventBus.emit("step:end", { stepIndex: i, step });

            await this.pluginManager.runAfterStep(pluginCtx, {
              stepIndex: i,
              step,
            });

            const toolDurationMs = Date.now() - toolSpanStart;
            this.config.telemetry?.recordMetric("tool.duration_ms", toolDurationMs, { tool: toolName });
          });
        } catch (error) {
          const onStepError = await this.pluginManager.runOnError(pluginCtx, {
            error,
            phase: "step",
          });
          if (!onStepError.suppress) throw error;
        }
      }

      if (cpConfig?.enabled) {
        const checkpoint = {
          id: runtime.randomUUID(),
          sessionId,
          stepIndex: steps.length,
          conversation: [
            { role: "user" as const, content: prompt },
            { role: "assistant" as const, content: result.text ?? "" },
          ],
          todos: await this.config.memory.loadTodos(sessionId),
          filesSnapshot: {},
          toolResults: {},
          generatedTokens: 0,
          lastToolCallId: null,
          metadata: {},
          createdAt: Date.now(),
        };
        await this.config.memory.saveCheckpoint(sessionId, checkpoint);
        this.eventBus.emit("checkpoint:save", { checkpoint });
      }

      // Extract all tool calls from steps
      const allToolCalls: Array<{ name: string; args?: unknown; stepIndex: number }> = [];
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i] as Record<string, unknown> | undefined;
        const calls = (s?.toolCalls as Array<{ toolName: string; args?: unknown }>) ?? [];
        for (const tc of calls) {
          allToolCalls.push({ name: tc.toolName, args: tc.args, stepIndex: i });
        }
      }

      const agentResult: DeepAgentResult = {
        text: result.text ?? "",
        steps,
        sessionId,
        output: (result as unknown as { output?: unknown }).output,
        toolCalls: allToolCalls,
      };

      this.eventBus.emit("agent:stop", { result: agentResult });
      await this.pluginManager.runAfterRun(pluginCtx, { result: agentResult });
      return agentResult;
    } catch (error: unknown) {
      const onErrorResult = await this.pluginManager.runOnError(pluginCtx, {
        error,
        phase: "run",
      });
      if (onErrorResult.suppress) {
        return { text: "", steps: [], sessionId, toolCalls: [] };
      }
      this.eventBus.emit("error", { error });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Stream
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async stream(
    params: { messages: Array<{ role: string; content: unknown }> },
    sessionId: string,
    runtime: RuntimePort,
    options: DeepAgentRunOptions = {},
  ): Promise<any> {
    let pluginCtx = this.toolManager.createPluginContext(sessionId, [], options.pluginMetadata);

    try {
      const prepared = await this.toolManager.prepareTools(
        sessionId,
        this.eventBus,
        runtime,
        options.pluginMetadata,
      );
      const tools = prepared.tools;
      pluginCtx = prepared.pluginCtx;

      // Inject learning context as a system message
      if (this.config.learning) {
        const userId = this.config.userId ?? sessionId;
        const [profile, memories] = await Promise.all([
          this.config.learning.getProfile(userId),
          this.config.learning.getMemories(userId, { limit: 10 }),
        ]);
        const learningContext = this.buildLearningContext(profile, memories);
        if (learningContext) {
          params = {
            ...params,
            messages: [
              { role: "system", content: learningContext },
              ...params.messages,
            ],
          };
        }
      }

      this.eventBus.emit("agent:start", { messages: params.messages });

      return this.withSpan("stream", { "stream.messages": params.messages.length }, async () => {
        const streamAgentOptions: Record<string, unknown> = {
          model: this.toolManager.createRateLimitedModel(),
          instructions: this.config.instructions,
          tools,
          stopWhen: stepCountIs(this.config.maxSteps),
        };
        if (this.config.output) streamAgentOptions.output = this.config.output;

        const agent = new ToolLoopAgent(streamAgentOptions as ConstructorParameters<typeof ToolLoopAgent>[0]);

        const streamResult = agent.stream(params as Parameters<typeof agent.stream>[0]);

        // Track cost from streaming after completion
        if (this.config.costTracker) {
          const costTracker = this.config.costTracker;
          const model = this.config.model;
          const tokenTracker = this.tokenTracker;
          return Promise.resolve(streamResult).then((stream) => {
            const usagePromise = (stream as unknown as Record<string, unknown>).usage ?? (stream as unknown as Record<string, unknown>).totalUsage;
            if (usagePromise && typeof (usagePromise as Promise<unknown>).then === "function") {
              (usagePromise as Promise<{ promptTokens?: number; completionTokens?: number }>).then((u) => {
                if (u) {
                  if (u.promptTokens) tokenTracker.addInput(u.promptTokens);
                  if (u.completionTokens) tokenTracker.addOutput(u.completionTokens);
                  if (u.promptTokens || u.completionTokens) {
                    const modelId = (model as unknown as { modelId?: string }).modelId ?? "unknown";
                    const provider = (model as unknown as { provider?: string }).provider ?? "unknown";
                    costTracker.recordUsage({
                      inputTokens: u.promptTokens ?? 0,
                      outputTokens: u.completionTokens ?? 0,
                      model: modelId,
                      provider,
                      timestamp: Date.now(),
                    });
                  }
                }
              }).catch((err: unknown) => {
                // fire-and-forget: usage tracking must not break streaming
                console.warn("[usage-tracking] Failed to record usage:", err instanceof Error ? err.message : String(err));
              });
            }
            return stream;
          });
        }

        return streamResult;
      });
    } catch (error: unknown) {
      const onErrorResult = await this.pluginManager.runOnError(pluginCtx, {
        error,
        phase: "stream",
      });
      if (onErrorResult.suppress) {
        return new ReadableStream({ start(c) { c.close(); } });
      }
      this.eventBus.emit("error", { error });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Learning context
  // ---------------------------------------------------------------------------

  private buildLearningContext(profile: UserProfile | null, memories: UserMemory[]): string {
    const parts: string[] = [];
    if (profile) {
      if (profile.context) parts.push(`User context: ${profile.context}`);
      if (profile.style) parts.push(`Preferred style: ${profile.style}`);
      if (profile.language) parts.push(`Language: ${profile.language}`);
    }
    if (memories.length > 0) {
      parts.push(`Known facts about this user:\n${memories.map((m) => `- ${m.content}`).join("\n")}`);
    }
    return parts.length > 0 ? `[Learning Context]\n${parts.join("\n")}` : "";
  }
}
