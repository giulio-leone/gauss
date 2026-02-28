// =============================================================================
// Agent Builder REST API — POST /agents endpoint
// =============================================================================

import {
  VisualAgentBuilder,
  ModelRegistry,
  AgentConfigSchema,
  type AgentConfigJSON,
  type CompiledAgent,
} from "./visual-agent-builder.js";

export interface AgentBuilderAPIOptions {
  registry: ModelRegistry;
  onError?: (error: Error) => void;
}

/**
 * Create request handler for the agent builder REST API.
 * Framework-agnostic: returns { status, body } for any HTTP framework.
 */
export class AgentBuilderAPI {
  private builder: VisualAgentBuilder;
  private agents = new Map<string, CompiledAgent>();

  constructor(options: AgentBuilderAPIOptions) {
    this.builder = new VisualAgentBuilder(options.registry);
  }

  /** POST /agents — Create a new agent from JSON config */
  async createAgent(body: unknown): Promise<{
    status: number;
    body: Record<string, unknown>;
  }> {
    try {
      const validation = this.builder.validate(body);
      if (!validation.valid) {
        return {
          status: 400,
          body: { error: "Invalid config", details: validation.errors },
        };
      }

      const config = AgentConfigSchema.parse(body);
      const agent = this.builder.compile(config);
      this.agents.set(agent.id, agent);

      return {
        status: 201,
        body: {
          id: agent.id,
          name: agent.name,
          nodes: config.nodes.length,
          edges: config.edges.length,
          entryNode: agent.entryNode,
        },
      };
    } catch (err) {
      return {
        status: 500,
        body: { error: (err as Error).message },
      };
    }
  }

  /** GET /agents — List all deployed agents */
  listAgents(): { status: number; body: Record<string, unknown> } {
    const agents = [...this.agents.values()].map((a) => ({
      id: a.id,
      name: a.name,
      nodes: a.config.nodes.length,
      edges: a.config.edges.length,
    }));

    return { status: 200, body: { agents, count: agents.length } };
  }

  /** GET /agents/:id — Get agent details */
  getAgent(id: string): { status: number; body: Record<string, unknown> } {
    const agent = this.agents.get(id);
    if (!agent) {
      return { status: 404, body: { error: `Agent "${id}" not found` } };
    }

    return {
      status: 200,
      body: {
        id: agent.id,
        name: agent.name,
        config: agent.config,
      },
    };
  }

  /** POST /agents/:id/run — Execute an agent */
  async runAgent(
    id: string,
    input: string
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const agent = this.agents.get(id);
    if (!agent) {
      return { status: 404, body: { error: `Agent "${id}" not found` } };
    }

    try {
      const result = await agent.execute(input);
      return { status: 200, body: result };
    } catch (err) {
      return { status: 500, body: { error: (err as Error).message } };
    }
  }

  /** DELETE /agents/:id — Remove an agent */
  deleteAgent(id: string): { status: number; body: Record<string, unknown> } {
    if (!this.agents.has(id)) {
      return { status: 404, body: { error: `Agent "${id}" not found` } };
    }
    this.agents.delete(id);
    return { status: 200, body: { deleted: id } };
  }
}
