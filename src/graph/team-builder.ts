// =============================================================================
// TeamBuilder — Fluent API for composing teams of specialist agents
// Supports coordinator/specialist roles and 4 coordination strategies.
// =============================================================================

import { SharedContext } from "./shared-context.js";
import type { AgentNode } from "./agent-node.js";
import { EventBus } from "../agent/event-bus.js";
import type { AgentEventType } from "../types.js";

// =============================================================================
// Types
// =============================================================================

export type CoordinationStrategy =
  | "round-robin"
  | "broadcast"
  | "delegate"
  | "consensus";

export interface TeamMember {
  id: string;
  role: "coordinator" | "specialist";
  agent: AgentNode;
  /** Optional specialties for delegate strategy routing */
  specialties?: string[];
}

export interface TeamConfig {
  id: string;
  members: TeamMember[];
  strategy: CoordinationStrategy;
  maxRounds?: number;
  consensusThreshold?: number;
  eventBus?: EventBus;
}

export interface TeamResult {
  teamId: string;
  strategy: CoordinationStrategy;
  rounds: TeamRound[];
  finalAnswer: string;
  metadata: Record<string, unknown>;
}

export interface TeamRound {
  round: number;
  memberId: string;
  role: "coordinator" | "specialist";
  input: string;
  output: string;
  durationMs: number;
}

// =============================================================================
// Team class — runtime execution of a team
// =============================================================================

export class Team {
  readonly id: string;
  readonly members: ReadonlyArray<TeamMember>;
  readonly strategy: CoordinationStrategy;
  readonly context: SharedContext;
  readonly eventBus: EventBus;
  private readonly maxRounds: number;
  private readonly consensusThreshold: number;

  constructor(config: TeamConfig) {
    this.id = config.id;
    this.members = config.members;
    this.strategy = config.strategy;
    this.maxRounds = config.maxRounds ?? 10;
    this.consensusThreshold = config.consensusThreshold ?? 0.5;
    this.eventBus = config.eventBus ?? new EventBus();
    this.context = new SharedContext();
  }

  /** Execute the team on a task */
  async run(task: string): Promise<TeamResult> {
    const rounds: TeamRound[] = [];
    let finalAnswer = "";

    switch (this.strategy) {
      case "round-robin":
        finalAnswer = await this.runRoundRobin(task, rounds);
        break;
      case "broadcast":
        finalAnswer = await this.runBroadcast(task, rounds);
        break;
      case "delegate":
        finalAnswer = await this.runDelegate(task, rounds);
        break;
      case "consensus":
        finalAnswer = await this.runConsensus(task, rounds);
        break;
    }

    return {
      teamId: this.id,
      strategy: this.strategy,
      rounds,
      finalAnswer,
      metadata: { totalRounds: rounds.length },
    };
  }

  private getCoordinator(): TeamMember {
    const coord = this.members.find((m) => m.role === "coordinator");
    if (!coord) throw new Error(`Team "${this.id}" has no coordinator`);
    return coord;
  }

  private getSpecialists(): TeamMember[] {
    return this.members.filter((m) => m.role === "specialist");
  }

  /** Round-robin: each specialist answers in turn, coordinator synthesizes */
  private async runRoundRobin(
    task: string,
    rounds: TeamRound[]
  ): Promise<string> {
    const specialists = this.getSpecialists();
    const coordinator = this.getCoordinator();
    const responses: string[] = [];

    for (const spec of specialists) {
      const round = await this.executeAgent(spec, task, rounds.length);
      rounds.push(round);
      responses.push(round.output);
    }

    // Coordinator synthesizes
    const synthesisPrompt = `Synthesize these specialist responses into a final answer:\n\nTask: ${task}\n\n${responses.map((r, i) => `Specialist ${i + 1}: ${r}`).join("\n\n")}`;
    const final = await this.executeAgent(
      coordinator,
      synthesisPrompt,
      rounds.length
    );
    rounds.push(final);
    return final.output;
  }

  /** Broadcast: all specialists answer in parallel, coordinator synthesizes */
  private async runBroadcast(
    task: string,
    rounds: TeamRound[]
  ): Promise<string> {
    const specialists = this.getSpecialists();
    const coordinator = this.getCoordinator();

    const results = await Promise.all(
      specialists.map((spec) => this.executeAgent(spec, task, rounds.length))
    );
    rounds.push(...results);

    const synthesisPrompt = `Synthesize these specialist responses into a final answer:\n\nTask: ${task}\n\n${results.map((r) => `${r.memberId}: ${r.output}`).join("\n\n")}`;
    const final = await this.executeAgent(
      coordinator,
      synthesisPrompt,
      rounds.length
    );
    rounds.push(final);
    return final.output;
  }

  /** Delegate: coordinator picks a specialist based on specialties */
  private async runDelegate(
    task: string,
    rounds: TeamRound[]
  ): Promise<string> {
    const specialists = this.getSpecialists();
    const coordinator = this.getCoordinator();

    // Coordinator decides who to delegate to
    const specList = specialists
      .map(
        (s) =>
          `- ${s.id}: specialties=[${(s.specialties ?? []).join(", ")}]`
      )
      .join("\n");
    const delegatePrompt = `Given this task, which specialist should handle it? Reply with ONLY the specialist ID.\n\nTask: ${task}\n\nAvailable specialists:\n${specList}`;
    const decision = await this.executeAgent(
      coordinator,
      delegatePrompt,
      rounds.length
    );
    rounds.push(decision);

    // Find the chosen specialist (fallback to first)
    const chosenId = decision.output.trim();
    const chosen =
      specialists.find((s) => s.id === chosenId) ?? specialists[0];

    if (!chosen) return decision.output;

    const result = await this.executeAgent(chosen, task, rounds.length);
    rounds.push(result);
    return result.output;
  }

  /** Consensus: all specialists vote, majority wins */
  private async runConsensus(
    task: string,
    rounds: TeamRound[]
  ): Promise<string> {
    const specialists = this.getSpecialists();
    const coordinator = this.getCoordinator();

    const results = await Promise.all(
      specialists.map((spec) => this.executeAgent(spec, task, rounds.length))
    );
    rounds.push(...results);

    // Coordinator evaluates consensus
    const consensusPrompt = `Evaluate these responses and determine the consensus answer. If >=${Math.round(this.consensusThreshold * 100)}% agree, return the consensus. Otherwise, synthesize the best answer.\n\nTask: ${task}\n\n${results.map((r) => `${r.memberId}: ${r.output}`).join("\n\n")}`;
    const final = await this.executeAgent(
      coordinator,
      consensusPrompt,
      rounds.length
    );
    rounds.push(final);
    return final.output;
  }

  private async executeAgent(
    member: TeamMember,
    input: string,
    roundNum: number
  ): Promise<TeamRound> {
    const start = Date.now();
    const result = await member.agent.execute(input, this.context);
    return {
      round: roundNum,
      memberId: member.id,
      role: member.role,
      input,
      output: typeof result === "string" ? result : JSON.stringify(result),
      durationMs: Date.now() - start,
    };
  }
}

// =============================================================================
// TeamBuilder — fluent API
// =============================================================================

export class TeamBuilder {
  private _id = "team";
  private _members: TeamMember[] = [];
  private _strategy: CoordinationStrategy = "broadcast";
  private _maxRounds = 10;
  private _consensusThreshold = 0.5;
  private _eventBus?: EventBus;

  /** Set team ID */
  id(id: string): this {
    this._id = id;
    return this;
  }

  /** Add the coordinator agent */
  coordinator(agent: AgentNode, id?: string): this {
    this._members.push({
      id: id ?? "coordinator",
      role: "coordinator",
      agent,
    });
    return this;
  }

  /** Add a specialist agent */
  specialist(
    agent: AgentNode,
    options?: { id?: string; specialties?: string[] }
  ): this {
    this._members.push({
      id: options?.id ?? `specialist-${this._members.length}`,
      role: "specialist",
      agent,
      specialties: options?.specialties,
    });
    return this;
  }

  /** Set coordination strategy */
  strategy(strategy: CoordinationStrategy): this {
    this._strategy = strategy;
    return this;
  }

  /** Set max rounds */
  maxRounds(n: number): this {
    this._maxRounds = n;
    return this;
  }

  /** Set consensus threshold (0-1) */
  consensusThreshold(t: number): this {
    this._consensusThreshold = t;
    return this;
  }

  /** Set event bus */
  eventBus(bus: EventBus): this {
    this._eventBus = bus;
    return this;
  }

  /** Build the team */
  build(): Team {
    if (!this._members.some((m) => m.role === "coordinator")) {
      throw new Error("Team must have at least one coordinator");
    }
    if (!this._members.some((m) => m.role === "specialist")) {
      throw new Error("Team must have at least one specialist");
    }
    return new Team({
      id: this._id,
      members: this._members,
      strategy: this._strategy,
      maxRounds: this._maxRounds,
      consensusThreshold: this._consensusThreshold,
      eventBus: this._eventBus,
    });
  }
}

/** Factory function */
export function team(): TeamBuilder {
  return new TeamBuilder();
}
