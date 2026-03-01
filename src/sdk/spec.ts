/**
 * AGENTS.MD and SKILL.MD parsers — parse agent/skill specifications from markdown.
 *
 * @example
 * ```ts
 * import { AgentSpec, SkillSpec, discoverAgents } from "gauss-ts";
 *
 * // Parse a single AGENTS.MD
 * const spec = AgentSpec.fromMarkdown(content);
 * console.log(spec.name, spec.tools);
 *
 * // Discover all agents in a directory tree
 * const agents = await discoverAgents("./agents");
 *
 * // Parse a SKILL.MD
 * const skill = SkillSpec.fromMarkdown(skillContent);
 * console.log(skill.steps);
 * ```
 */

import {
  parseAgentsMd,
  discoverAgents as napiDiscoverAgents,
  parseSkillMd,
} from "gauss-napi";

// ─── Types ─────────────────────────────────────────────────────────

/** Tool reference within an AGENTS.MD spec. */
export interface AgentToolSpec {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** Parsed agent specification from AGENTS.MD. */
export interface AgentSpecData {
  name: string;
  description: string;
  model?: string;
  provider?: string;
  instructions?: string;
  tools: AgentToolSpec[];
  skills: string[];
  capabilities: string[];
  environment: Array<[string, string]>;
  metadata: Record<string, unknown>;
}

/** Step within a SKILL.MD spec. */
export interface SkillStep {
  description: string;
  action?: string;
}

/** Input or output parameter in a SKILL.MD spec. */
export interface SkillParam {
  name: string;
  param_type: string;
  description: string;
  required: boolean;
}

/** Parsed skill specification from SKILL.MD. */
export interface SkillSpecData {
  name: string;
  description: string;
  steps: SkillStep[];
  inputs: SkillParam[];
  outputs: SkillParam[];
}

// ─── AgentSpec ─────────────────────────────────────────────────────

/** Immutable parsed AGENTS.MD specification with a fluent API. */
export class AgentSpec {
  readonly name: string;
  readonly description: string;
  readonly model?: string;
  readonly provider?: string;
  readonly instructions?: string;
  readonly tools: readonly AgentToolSpec[];
  readonly skills: readonly string[];
  readonly capabilities: readonly string[];
  readonly environment: ReadonlyMap<string, string>;
  readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(data: AgentSpecData) {
    this.name = data.name;
    this.description = data.description;
    this.model = data.model ?? undefined;
    this.provider = data.provider ?? undefined;
    this.instructions = data.instructions ?? undefined;
    this.tools = Object.freeze([...data.tools]);
    this.skills = Object.freeze([...data.skills]);
    this.capabilities = Object.freeze([...data.capabilities]);
    this.environment = new Map(data.environment);
    this.metadata = Object.freeze({ ...data.metadata });
  }

  /** Parse an AGENTS.MD markdown string into an AgentSpec. */
  static fromMarkdown(content: string): AgentSpec {
    const json = parseAgentsMd(content);
    const data: AgentSpecData = typeof json === "string" ? JSON.parse(json) : json;
    return new AgentSpec(data);
  }

  /** Check whether a specific tool is declared in this spec. */
  hasTool(name: string): boolean {
    return this.tools.some((t) => t.name === name);
  }

  /** Check whether a specific capability is declared. */
  hasCapability(name: string): boolean {
    return this.capabilities.includes(name);
  }

  /** Serialize back to a plain object. */
  toJSON(): AgentSpecData {
    return {
      name: this.name,
      description: this.description,
      model: this.model,
      provider: this.provider,
      instructions: this.instructions,
      tools: [...this.tools],
      skills: [...this.skills],
      capabilities: [...this.capabilities],
      environment: [...this.environment.entries()],
      metadata: { ...this.metadata },
    };
  }
}

// ─── SkillSpec ─────────────────────────────────────────────────────

/** Immutable parsed SKILL.MD specification with a fluent API. */
export class SkillSpec {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly SkillStep[];
  readonly inputs: readonly SkillParam[];
  readonly outputs: readonly SkillParam[];

  private constructor(data: SkillSpecData) {
    this.name = data.name;
    this.description = data.description;
    this.steps = Object.freeze([...data.steps]);
    this.inputs = Object.freeze([...data.inputs]);
    this.outputs = Object.freeze([...data.outputs]);
  }

  /** Parse a SKILL.MD markdown string into a SkillSpec. */
  static fromMarkdown(content: string): SkillSpec {
    const json = parseSkillMd(content);
    const data: SkillSpecData = typeof json === "string" ? JSON.parse(json) : json;
    return new SkillSpec(data);
  }

  /** Get the total number of steps. */
  get stepCount(): number {
    return this.steps.length;
  }

  /** Get all required inputs. */
  get requiredInputs(): readonly SkillParam[] {
    return this.inputs.filter((p) => p.required);
  }

  /** Serialize back to a plain object. */
  toJSON(): SkillSpecData {
    return {
      name: this.name,
      description: this.description,
      steps: [...this.steps],
      inputs: [...this.inputs],
      outputs: [...this.outputs],
    };
  }
}

// ─── Discovery ─────────────────────────────────────────────────────

/** Discover all AGENTS.MD files in a directory tree and parse them. */
export function discoverAgents(dir: string): AgentSpec[] {
  const json = napiDiscoverAgents(dir);
  const list: AgentSpecData[] = typeof json === "string" ? JSON.parse(json) : json;
  return list.map((data) => {
    // Re-use the private constructor via fromMarkdown won't work here,
    // so we create via toJSON round-trip
    return Object.assign(Object.create(AgentSpec.prototype), {
      name: data.name,
      description: data.description,
      model: data.model ?? undefined,
      provider: data.provider ?? undefined,
      instructions: data.instructions ?? undefined,
      tools: Object.freeze([...data.tools]),
      skills: Object.freeze([...data.skills]),
      capabilities: Object.freeze([...data.capabilities]),
      environment: new Map(data.environment),
      metadata: Object.freeze({ ...data.metadata }),
    }) as AgentSpec;
  });
}
