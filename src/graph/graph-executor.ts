// =============================================================================
// GraphExecutor — Reactive, event-driven DAG execution engine
// Uses WorkerPool (work-stealing), IncrementalReadyTracker (push-based),
// AsyncChannel (callback→AsyncGenerator bridge), and TokenBudgetController.
// =============================================================================

import type { GraphConfig, GraphResult, GraphStreamEvent } from "../domain/graph.schema.js";
import type { ConsensusPort } from "../ports/consensus.port.js";
import type { NodeResult } from "./agent-node.js";
import type { AgentNode } from "./agent-node.js";
import type { SharedContext } from "./shared-context.js";
import type { EventBus } from "../agent/event-bus.js";
import type { TelemetryPort } from "../ports/telemetry.port.js";
import { WorkerPool } from "./worker-pool.js";
import { AsyncChannel } from "./async-channel.js";
import { IncrementalReadyTracker } from "./incremental-ready-tracker.js";
import { TokenBudgetController } from "./token-budget-controller.js";
import { ForkCoordinator } from "./fork-coordinator.js";

interface NodeTask {
  nodeId: string;
  prompt: string;
}

export interface GraphCheckpoint {
  completedNodes: Map<string, NodeResult>;
  pendingDepsSnapshot: Map<string, number>;
  tokenUsage: { input: number; output: number };
  elapsedMs: number;
  prompt: string;
}

export class GraphExecutor {
  private static readonly CHECKPOINT_INTERVAL = 5;

  constructor(
    private readonly nodes: Map<string, AgentNode>,
    private readonly edges: Map<string, string[]>,
    private readonly forks: Map<
      string,
      { nodes: AgentNode[]; consensus?: ConsensusPort }
    >,
    private readonly config: GraphConfig,
    private readonly sharedContext: SharedContext,
    private readonly eventBus?: EventBus,
    private readonly telemetry?: TelemetryPort,
  ) {}

  async execute(prompt: string): Promise<GraphResult> {
    let result: GraphResult | undefined;
    for await (const event of this.stream(prompt)) {
      if (event.type === "graph:complete") {
        result = event.result;
      }
      if (event.type === "graph:error") {
        throw new Error(event.error);
      }
    }
    if (!result) throw new Error("Graph execution produced no result");
    return result;
  }

  async *stream(prompt: string): AsyncGenerator<GraphStreamEvent> {
    const start = Date.now();
    const nodeResults = new Map<string, NodeResult>();
    let totalInput = 0;
    let totalOutput = 0;
    let completedCount = 0;
    const totalNodes = this.nodes.size;
    let terminated = false;

    const channel = new AsyncChannel<GraphStreamEvent>();
    const budgetCtrl = new TokenBudgetController(this.config.maxTokenBudget);

    // ── WorkerPool with executor closure ──
    const pool = new WorkerPool<NodeTask, NodeResult>(
      async (task: NodeTask, signal: AbortSignal): Promise<NodeResult> => {
        const { nodeId } = task;
        this.eventBus?.emit("node:start", { nodeId });
        channel.push({ type: "node:start", nodeId });
        const nodeSpan = this.telemetry?.startSpan(
          `graph.node.${nodeId}`,
          { "node.id": nodeId },
        );

        try {
          const fork = this.forks.get(nodeId);
          if (fork) {
            const result = await this.executeForkTask(
              nodeId, prompt, fork, nodeResults, channel,
            );
            nodeSpan?.setAttribute("node.duration_ms", result.durationMs);
            nodeSpan?.setStatus("OK");
            return result;
          }

          const node = this.nodes.get(nodeId);
          if (!node) throw new Error(`Node "${nodeId}" not found`);

          const enrichedPrompt = this.buildNodePrompt(prompt, nodeId, nodeResults);
          const result = await node.run(enrichedPrompt, this.sharedContext);
          nodeSpan?.setAttribute("node.duration_ms", result.durationMs);
          nodeSpan?.setStatus("OK");
          return result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          nodeSpan?.setStatus("ERROR", errorMsg);
          throw error;
        } finally {
          nodeSpan?.end();
        }
      },
      {
        initialSize: this.config.maxConcurrency,
        minSize: 1,
        maxSize: this.config.maxConcurrency,
        taskTimeoutMs: 600_000,
        heartbeatIntervalMs: 60_000,
        idleShrinkMs: 30_000,
        growThreshold: 10,
      },
    );

    const emitError = (errorMsg: string) => {
      if (terminated) return;
      terminated = true;
      const partialResults: Record<string, NodeResult> = {};
      for (const [id, r] of nodeResults) {
        partialResults[id] = r;
      }
      this.eventBus?.emit("graph:complete", {
        totalDurationMs: Date.now() - start,
        totalTokenUsage: { input: totalInput, output: totalOutput },
        error: errorMsg,
      });
      channel.push({ type: "graph:error", error: errorMsg, partialResults });
      channel.close();
    };

    const emitCompletion = () => {
      if (terminated) return;
      terminated = true;
      const lastNodeId = this.findTerminalNode();
      const lastResult = nodeResults.get(lastNodeId)!;
      const resultMap: Record<string, NodeResult> = {};
      for (const [id, r] of nodeResults) {
        resultMap[id] = r;
      }
      const result: GraphResult = {
        output: lastResult.output,
        nodeResults: resultMap,
        totalDurationMs: Date.now() - start,
        totalTokenUsage: { input: totalInput, output: totalOutput },
      };
      this.eventBus?.emit("graph:complete", {
        totalDurationMs: result.totalDurationMs,
        totalTokenUsage: result.totalTokenUsage,
      });
      channel.push({ type: "graph:complete", result });
      channel.close();
    };

    // ── IncrementalReadyTracker: push-based scheduling ──
    const tracker = new IncrementalReadyTracker(
      this.edges,
      this.nodes.keys(),
      (nodeId: string) => {
        if (nodeResults.has(nodeId) || terminated) return;

        pool
          .submit(nodeId, { nodeId, prompt }, 0)
          .then((result) => {
            if (terminated) return;
            nodeResults.set(result.nodeId, result);
            completedCount++;

            if (result.tokenUsage) {
              totalInput += result.tokenUsage.input;
              totalOutput += result.tokenUsage.output;
              budgetCtrl.release(result.tokenUsage);
            }

            this.eventBus?.emit("node:complete", { nodeId, result });
            channel.push({ type: "node:complete", nodeId, result });

            // Budget enforcement
            if (totalInput + totalOutput > this.config.maxTokenBudget) {
              emitError("Token budget exceeded");
              return;
            }

            // Budget soft/hard warnings
            const budgetStatus = budgetCtrl.check({ input: totalInput, output: totalOutput });
            if (budgetStatus === "soft-limit") {
              channel.push({
                type: "budget:warning",
                remaining: budgetCtrl.remaining(),
                used: totalInput + totalOutput,
                threshold: "soft",
              });
            } else if (budgetStatus === "hard-limit") {
              channel.push({
                type: "budget:warning",
                remaining: budgetCtrl.remaining(),
                used: totalInput + totalOutput,
                threshold: "hard",
              });
            }

            // Checkpoint every N nodes
            if (
              completedCount % GraphExecutor.CHECKPOINT_INTERVAL === 0 &&
              completedCount < totalNodes
            ) {
              const cp: GraphCheckpoint = {
                completedNodes: new Map(nodeResults),
                pendingDepsSnapshot: tracker.snapshot(),
                tokenUsage: { input: totalInput, output: totalOutput },
                elapsedMs: Date.now() - start,
                prompt,
              };
              channel.push({
                type: "checkpoint:saved",
                checkpoint: JSON.stringify({
                  completedNodeIds: [...cp.completedNodes.keys()],
                  tokenUsage: cp.tokenUsage,
                  elapsedMs: cp.elapsedMs,
                }),
                completedCount,
              });
            }

            // Trigger successors via tracker (push-based)
            tracker.markCompleted(nodeId);

            // Check completion
            if (completedCount === totalNodes) {
              emitCompletion();
            }
          })
          .catch((error) => {
            if (terminated) return;
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            this.eventBus?.emit("node:complete", { nodeId, error: errorMsg });
            channel.push({ type: "node:error", nodeId, error: errorMsg });
            emitError(errorMsg);
          });
      },
    );

    this.eventBus?.emit("graph:start", { nodeCount: totalNodes });
    yield { type: "graph:start", nodeCount: totalNodes };

    // Seed nodes with zero dependencies
    tracker.seedInitialReady();

    // Deadlock detection: if no nodes were seeded and graph isn't empty
    if (completedCount === 0 && totalNodes > 0 && terminated === false) {
      // Check if any node has zero deps (should have been seeded)
      let hasZeroDeps = false;
      for (const nodeId of this.nodes.keys()) {
        const deps = this.edges.get(nodeId) ?? [];
        if (deps.length === 0) {
          hasZeroDeps = true;
          break;
        }
      }
      if (!hasZeroDeps) {
        emitError("Deadlock: no nodes ready but graph incomplete");
      }
    }

    // Graph-level timeout
    const timeoutTimer = setTimeout(() => {
      emitError("Graph execution timed out");
    }, this.config.timeoutMs);

    try {
      for await (const event of channel) {
        yield event;
        if (
          event.type === "graph:complete" ||
          event.type === "graph:error"
        ) {
          break;
        }
      }
    } finally {
      clearTimeout(timeoutTimer);
      await pool.drain(5_000).catch(() => {});
    }
  }

  // ── Fork execution with ForkCoordinator ──

  private async executeForkTask(
    forkId: string,
    prompt: string,
    fork: { nodes: AgentNode[]; consensus?: ConsensusPort },
    previousResults: Map<string, NodeResult>,
    channel: AsyncChannel<GraphStreamEvent>,
  ): Promise<NodeResult> {
    const forkStart = Date.now();
    const enrichedPrompt = this.buildNodePrompt(prompt, forkId, previousResults);

    this.eventBus?.emit("fork:start", { forkId, agentCount: fork.nodes.length });
    channel.push({ type: "fork:start", forkId, agentCount: fork.nodes.length });

    const coordinator = new ForkCoordinator(
      forkId,
      fork.nodes.map((n) => n.id),
      Math.max(this.config.timeoutMs / 2, 5_000),
      Math.max(1, Math.ceil(fork.nodes.length / 2)),
      (partial) => {
        channel.push({
          type: "fork:partial",
          forkId,
          completedCount: partial.length,
          totalCount: fork.nodes.length,
          partialResults: partial,
        });
      },
    );

    const promises = fork.nodes.map(async (node) => {
      try {
        const result = await node.run(enrichedPrompt, this.sharedContext);
        coordinator.onNodeComplete(node.id, result);
      } catch (error) {
        coordinator.onNodeError(
          node.id,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });

    let results: NodeResult[];
    try {
      results = await coordinator.promise;
    } catch (error) {
      await Promise.allSettled(promises);
      coordinator.dispose();
      this.eventBus?.emit("fork:complete", {
        forkId,
        error: error instanceof Error ? error.message : String(error),
      });
      channel.push({ type: "fork:complete", forkId, results: [] });
      throw error;
    }

    this.eventBus?.emit("fork:complete", { forkId, resultCount: results.length });
    channel.push({ type: "fork:complete", forkId, results });

    let output: string;
    let tokenUsage = { input: 0, output: 0 };
    for (const r of results) {
      if (r.tokenUsage) {
        tokenUsage.input += r.tokenUsage.input;
        tokenUsage.output += r.tokenUsage.output;
      }
    }

    if (fork.consensus) {
      this.eventBus?.emit("consensus:start", { forkId });
      channel.push({ type: "consensus:start", forkId });
      try {
        const consensusInput = results.map((r) => ({
          id: r.nodeId,
          output: r.output,
        }));
        const consensusResult = await fork.consensus.evaluate(consensusInput);
        this.eventBus?.emit("consensus:result", {
          forkId,
          winnerId: consensusResult.winnerId,
          merged: !!consensusResult.merged,
        });
        output = consensusResult.merged ?? consensusResult.winnerOutput;
        channel.push({ type: "consensus:result", forkId, output });
      } catch (error) {
        this.eventBus?.emit("consensus:result", {
          forkId,
          error: error instanceof Error ? error.message : String(error),
        });
        channel.push({ type: "consensus:result", forkId, output: "" });
        coordinator.dispose();
        throw error;
      }
    } else {
      output = results[0]!.output;
    }

    const result: NodeResult = {
      nodeId: forkId,
      output,
      tokenUsage,
      durationMs: Date.now() - forkStart,
    };
    await this.sharedContext.setNodeResult(forkId, output);
    coordinator.dispose();
    return result;
  }

  // ── Helpers ──

  private buildNodePrompt(
    basePrompt: string,
    nodeId: string,
    previousResults: Map<string, NodeResult>,
  ): string {
    const deps = this.edges.get(nodeId) ?? [];
    if (deps.length === 0) return basePrompt;

    const context = deps
      .map((depId) => {
        const r = previousResults.get(depId);
        return r ? `[${depId}]: ${r.output}` : "";
      })
      .filter(Boolean)
      .join("\n\n");

    return `${basePrompt}\n\n--- Previous results ---\n${context}`;
  }

  private findTerminalNode(): string {
    const isDependency = new Set<string>();
    for (const deps of this.edges.values()) {
      for (const d of deps) isDependency.add(d);
    }
    for (const nodeId of this.nodes.keys()) {
      if (!isDependency.has(nodeId)) return nodeId;
    }
    return [...this.nodes.keys()].pop()!;
  }
}
