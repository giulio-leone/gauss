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
    return this;
  }

  async run(prompt: string): Promise<Record<string, unknown>> {
    this.assertNotDisposed();
    return graph_run(this._handle, prompt) as Promise<Record<string, unknown>>;
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

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("Graph has been destroyed");
  }
}
