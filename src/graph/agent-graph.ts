// =============================================================================
// AgentGraph — Declarative agent graph with builder API
// =============================================================================

import { GraphConfigSchema } from "../domain/graph.schema.js";
import type { GraphConfig, GraphResult, GraphStreamEvent } from "../domain/graph.schema.js";
import type { DeepAgentConfig } from "../types.js";
import type { ConsensusPort } from "../ports/consensus.port.js";
import type { FilesystemPort } from "../ports/filesystem.port.js";
import type { EventBus } from "../agent/event-bus.js";
import { AbstractBuilder } from "../utils/abstract-builder.js";
import { AgentNode } from "./agent-node.js";
import { GraphExecutor } from "./graph-executor.js";
import { SharedContext } from "./shared-context.js";
import { VirtualFilesystem } from "../adapters/filesystem/virtual-fs.adapter.js";

export class AgentGraph {
  constructor(
    private readonly nodes: Map<string, AgentNode>,
    private readonly edges: Map<string, string[]>,
    private readonly forks: Map<
      string,
      { nodes: AgentNode[]; consensus?: ConsensusPort }
    >,
    private readonly config: GraphConfig,
    private readonly fs: FilesystemPort,
    private readonly eventBus?: EventBus,
  ) {}

  static create(config?: Partial<GraphConfig>): AgentGraphBuilder {
    return new AgentGraphBuilder(config);
  }

  async run(prompt: string): Promise<GraphResult> {
    const sharedContext = new SharedContext(this.fs);
    const executor = new GraphExecutor(
      this.nodes,
      this.edges,
      this.forks,
      this.config,
      sharedContext,
      this.eventBus,
    );
    return executor.execute(prompt);
  }

  async *stream(prompt: string): AsyncGenerator<GraphStreamEvent> {
    const sharedContext = new SharedContext(this.fs);
    const executor = new GraphExecutor(
      this.nodes,
      this.edges,
      this.forks,
      this.config,
      sharedContext,
      this.eventBus,
    );
    yield* executor.stream(prompt);
  }
}

export class AgentGraphBuilder extends AbstractBuilder<AgentGraph> {
  private readonly nodeMap = new Map<string, AgentNode>();
  private readonly edgeMap = new Map<string, string[]>();
  private readonly forkMap = new Map<
    string,
    { nodes: AgentNode[]; consensus?: ConsensusPort }
  >();
  private readonly config: GraphConfig;
  private fs: FilesystemPort | undefined;
  private eventBus: EventBus | undefined;

  constructor(config?: Partial<GraphConfig>) {
    super();
    this.config = GraphConfigSchema.parse(config ?? {});
  }

  node(id: string, config: DeepAgentConfig): this {
    if (this.nodeMap.has(id)) {
      throw new Error(`Node "${id}" already exists`);
    }
    this.nodeMap.set(
      id,
      new AgentNode({ id, type: "agent", agentConfig: config }),
    );
    return this;
  }

  edge(from: string, to: string): this {
    const deps = this.edgeMap.get(to) ?? [];
    deps.push(from);
    this.edgeMap.set(to, deps);
    return this;
  }

  fork(id: string, configs: DeepAgentConfig[]): this {
    if (configs.length < 2) {
      throw new Error(`Fork "${id}" requires at least 2 configs`);
    }
    if (this.nodeMap.has(id) || this.forkMap.has(id)) {
      throw new Error(`Node "${id}" already exists`);
    }
    const forkNodes = configs.map(
      (cfg, i) =>
        new AgentNode({
          id: `${id}__fork_${i}`,
          type: "agent",
          agentConfig: cfg,
        }),
    );
    // Register a placeholder node for the fork so edges can reference it
    this.nodeMap.set(
      id,
      new AgentNode({ id, type: "agent" }),
    );
    this.forkMap.set(id, { nodes: forkNodes });
    return this;
  }

  consensus(forkId: string, strategy: ConsensusPort): this {
    const fork = this.forkMap.get(forkId);
    if (!fork) {
      throw new Error(
        `Cannot set consensus: "${forkId}" is not a fork node`,
      );
    }
    fork.consensus = strategy;
    return this;
  }

  withFilesystem(fs: FilesystemPort): this {
    this.fs = fs;
    return this;
  }

  withEventBus(eventBus: EventBus): this {
    this.eventBus = eventBus;
    return this;
  }

  protected validate(): void {
    this.validateEdges();
    this.validateNoCycles();
  }

  protected construct(): AgentGraph {
    return new AgentGraph(
      this.nodeMap,
      this.edgeMap,
      this.forkMap,
      this.config,
      this.fs ?? new VirtualFilesystem(),
      this.eventBus,
    );
  }

  private validateEdges(): void {
    for (const [to, deps] of this.edgeMap) {
      if (!this.nodeMap.has(to)) {
        throw new Error(`Edge target "${to}" does not exist`);
      }
      for (const from of deps) {
        if (!this.nodeMap.has(from)) {
          throw new Error(`Edge source "${from}" does not exist`);
        }
      }
    }
  }

  private validateNoCycles(): void {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const visit = (nodeId: string): void => {
      if (stack.has(nodeId)) {
        throw new Error(`Cycle detected involving node "${nodeId}"`);
      }
      if (visited.has(nodeId)) return;
      stack.add(nodeId);
      const deps = this.edgeMap.get(nodeId) ?? [];
      for (const dep of deps) {
        visit(dep);
      }
      stack.delete(nodeId);
      visited.add(nodeId);
    };

    for (const nodeId of this.nodeMap.keys()) {
      visit(nodeId);
    }
  }
}
