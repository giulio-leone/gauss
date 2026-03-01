/**
 * Team — multi-agent coordination backed by Rust core.
 *
 * @example
 *   const researcher = new Agent({ name: "researcher", instructions: "Research topics" });
 *   const writer = new Agent({ name: "writer", instructions: "Write summaries" });
 *
 *   const team = new Team("content-team")
 *     .add(researcher)
 *     .add(writer)
 *     .strategy("sequential");
 *
 *   const result = await team.run("Explain quantum computing");
 *   console.log(result.finalText);
 *   team.destroy();
 */
import {
  create_team,
  team_add_agent,
  team_set_strategy,
  team_run,
  destroy_team,
} from "gauss-napi";

import type { Handle, Disposable } from "./types.js";
import type { Agent } from "./agent.js";

export type TeamStrategy = "sequential" | "parallel";

export interface TeamResult {
  finalText: string;
  results: Array<{
    text: string;
    steps: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

export class Team implements Disposable {
  private readonly _handle: Handle;
  private disposed = false;
  private agents: Agent[] = [];

  constructor(name: string) {
    this._handle = create_team(name);
  }

  get handle(): Handle {
    return this._handle;
  }

  /** Add an agent to the team. */
  add(agent: Agent, instructions?: string): this {
    this.assertNotDisposed();
    team_add_agent(this._handle, agent.name, agent.handle, instructions);
    this.agents.push(agent);
    return this;
  }

  /** Set the team coordination strategy. */
  strategy(s: TeamStrategy): this {
    this.assertNotDisposed();
    team_set_strategy(this._handle, s);
    return this;
  }

  /** Run the team with a prompt or messages. */
  async run(prompt: string): Promise<TeamResult> {
    this.assertNotDisposed();
    const messages = JSON.stringify([
      { role: "user", content: [{ type: "text", text: prompt }] },
    ]);
    return team_run(this._handle, messages) as Promise<TeamResult>;
  }

  destroy(): void {
    if (!this.disposed) {
      this.disposed = true;
      try {
        destroy_team(this._handle);
      } catch {
        /* ok */
      }
    }
  }

  [Symbol.dispose](): void {
    this.destroy();
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("Team has been destroyed");
  }
}
