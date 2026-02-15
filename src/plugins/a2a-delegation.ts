// =============================================================================
// A2A Delegation — Multi-Agent Capability-based Delegation
// =============================================================================

import type { A2AJsonRpcRequest, A2AJsonRpcResponse, A2ATask } from "./a2a-handler.js";

export interface AgentCapability {
  name: string;
  description: string;
  skills: string[];
  endpoint: string;
}

export interface DelegationResult {
  selectedAgent: AgentCapability;
  taskId: string;
  result: unknown;
}

export class A2ADelegationManager {
  private readonly agents = new Map<string, AgentCapability>();
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = globalThis.fetch) {
    if (!fetchImpl) {
      throw new Error("A2ADelegationManager requires a fetch implementation");
    }
    this.fetchImpl = fetchImpl;
  }

  register(agent: AgentCapability): void {
    this.agents.set(agent.name, agent);
  }

  unregister(name: string): void {
    this.agents.delete(name);
  }

  listAgents(): AgentCapability[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find the best agent for a task based on required skills.
   * Uses a simple skill overlap scoring system.
   */
  findAgent(requiredSkills: string[]): AgentCapability | null {
    if (requiredSkills.length === 0) {
      const agents = Array.from(this.agents.values());
      return agents.length > 0 ? agents[0] : null;
    }

    let bestAgent: AgentCapability | null = null;
    let bestScore = 0;

    for (const agent of this.agents.values()) {
      const overlap = requiredSkills.filter(skill =>
        agent.skills.some(agentSkill =>
          agentSkill.toLowerCase().includes(skill.toLowerCase()) ||
          skill.toLowerCase().includes(agentSkill.toLowerCase())
        )
      );
      
      const score = overlap.length / requiredSkills.length;
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  /**
   * Delegate a task to the best matching agent.
   */
  async delegate(
    prompt: string,
    requiredSkills: string[],
    fetchImpl: typeof fetch = this.fetchImpl
  ): Promise<DelegationResult> {
    const selectedAgent = this.findAgent(requiredSkills);
    if (!selectedAgent) {
      throw new Error("No suitable agent found for delegation");
    }

    const taskId = crypto.randomUUID();
    const payload: A2AJsonRpcRequest = {
      jsonrpc: "2.0",
      id: taskId,
      method: "tasks/send",
      params: {
        prompt,
        taskId,
        metadata: { delegatedSkills: requiredSkills }
      }
    };

    try {
      const response = await fetchImpl(selectedAgent.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Agent endpoint returned HTTP ${response.status}`);
      }

      const result = await response.json() as A2AJsonRpcResponse;
      
      if (result.error) {
        throw new Error(`Agent error [${result.error.code}]: ${result.error.message}`);
      }

      return {
        selectedAgent,
        taskId,
        result: result.result
      };
    } catch (error) {
      throw new Error(`Delegation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}