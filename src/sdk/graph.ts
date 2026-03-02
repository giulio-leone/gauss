/**
 * Graph — DAG-based multi-agent execution backed by Rust core.
 *
 * @example
 *   const researcher = new Agent({ name: "researcher", instructions: "Research topics" });
 *   const writer = new Agent({ name: "writer", instructions: "Write articles" });
 *
 *   const graph = new Graph()
 *     .addNode({ nodeId: "research", agent: researcher })
 *     .addNode({ nodeId: "write", agent: writer })
 *     .addEdge("research", "write");
 *
 *   const result = await graph.run("Write about quantum computing");
 *   graph.destroy();
 */
import {
  create_graph,
  graph_add_node,
  graph_add_edge,
  graph_add_fork_node,
  graph_run,
  destroy_graph,
} from "gauss-napi";

import type { Handle, Disposable, ToolDef } from "./types.js";
import type { Agent } from "./agent.js";

/** Router function invoked at runtime to decide the next node. */
export type RouterFn = (result: Record<string, unknown>) => string | Promise<string>;

export interface GraphNodeConfig {
  nodeId: string;
  agent: Agent;
  instructions?: string;
  tools?: ToolDef[];
}

export type ConsensusStrategy = "first" | "concat";

export interface ForkNodeConfig {
  nodeId: string;
  agents: Array<{ agent: Agent; instructions?: string }>;
  consensus?: ConsensusStrategy;
}

export class Graph implements Disposable {
  private readonly _handle: Handle;
  private disposed = false;

  /** Node registry for SDK-level stepping. */
  private readonly _nodes = new Map<string, { agent: Agent; instructions?: string }>();
  /** Regular edges tracked locally for SDK-level stepping. */
  private readonly _edges = new Map<string, string>();
  /** Conditional edges: source node → router function. */
  private readonly _conditionalEdges = new Map<string, RouterFn>();

  constructor() {
    this._handle = create_graph();
  }

  get handle(): Handle {
    return this._handle;
  }

  addNode(config: GraphNodeConfig): this {
    this.assertNotDisposed();
    graph_add_node(
      this._handle,
      config.nodeId,
      config.agent.name,
      config.agent.handle,
      config.instructions,
      config.tools ?? []
    );
    this._nodes.set(config.nodeId, {
      agent: config.agent,
      instructions: config.instructions,
    });
    return this;
  }

  /** Add a fork node — runs multiple agents in parallel, merging via consensus. */
  addFork(config: ForkNodeConfig): this {
    this.assertNotDisposed();
    graph_add_fork_node(
      this._handle,
      config.nodeId,
      config.agents.map(a => ({
        agentName: a.agent.name,
        providerHandle: a.agent.handle,
        instructions: a.instructions,
      })),
      config.consensus ?? "concat"
    );
    return this;
  }

  addEdge(from: string, to: string): this {
    this.assertNotDisposed();
    graph_add_edge(this._handle, from, to);
    this._edges.set(from, to);
    return this;
  }

  /**
   * Add a conditional edge — at runtime the router function receives the
   * source node's result and returns the ID of the next node to execute.
   */
  addConditionalEdge(from: string, router: RouterFn): this {
    this.assertNotDisposed();
    this._conditionalEdges.set(from, router);
    return this;
  }

  async run(prompt: string): Promise<Record<string, unknown>> {
    this.assertNotDisposed();

    // Fast path: no conditional edges → delegate entirely to Rust core.
    if (this._conditionalEdges.size === 0) {
      return graph_run(this._handle, prompt) as Promise<Record<string, unknown>>;
    }

    return this._runWithConditionals(prompt);
  }

  destroy(): void {
    if (!this.disposed) {
      this.disposed = true;
      try { destroy_graph(this._handle); } catch { /* ok */ }
    }
  }

  [Symbol.dispose](): void {
    this.destroy();
  }

  // ── Private ──────────────────────────────────────────────────────

  /** SDK-level step-through execution when conditional edges are present. */
  private async _runWithConditionals(prompt: string): Promise<Record<string, unknown>> {
    // Determine entry node: a node with no incoming edges.
    const targets = new Set<string>([
      ...this._edges.values(),
    ]);
    const entryNodes = [...this._nodes.keys()].filter(n => !targets.has(n));
    if (entryNodes.length === 0) {
      throw new Error("Graph has no entry node (every node has an incoming edge)");
    }

    const outputs: Record<string, Record<string, unknown>> = {};
    let currentNodeId: string | undefined = entryNodes[0];
    let currentPrompt = prompt;

    while (currentNodeId) {
      const nodeCfg = this._nodes.get(currentNodeId);
      if (!nodeCfg) {
        throw new Error(`Node "${currentNodeId}" not found in graph`);
      }

      const agentInput = nodeCfg.instructions
        ? `${nodeCfg.instructions}\n\n${currentPrompt}`
        : currentPrompt;

      const result = await nodeCfg.agent.run(agentInput);
      const nodeOutput: Record<string, unknown> = {
        text: result.text,
        ...(result.structuredOutput ? { structuredOutput: result.structuredOutput } : {}),
      };
      outputs[currentNodeId] = nodeOutput;

      // Decide next node.
      const router = this._conditionalEdges.get(currentNodeId);
      if (router) {
        currentNodeId = await router(nodeOutput);
      } else {
        currentNodeId = this._edges.get(currentNodeId);
      }

      // Feed previous output as prompt for the next node.
      currentPrompt = result.text;
    }

    // Build result envelope matching graph_run shape.
    const nodeIds = Object.keys(outputs);
    const lastNodeId = nodeIds[nodeIds.length - 1];
    return {
      outputs,
      final_text: (outputs[lastNodeId]?.text as string) ?? "",
    };
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("Graph has been destroyed");
  }
}
