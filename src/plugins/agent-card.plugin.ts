// =============================================================================
// AgentCardPlugin — Generates and serves agents.md / skills.md
// =============================================================================

import { tool, type Tool } from "ai";
import { z } from "zod";

import type {
  DeepAgentPlugin,
  PluginContext,
  PluginSetupContext,
} from "../ports/plugin.port.js";
import type { FilesystemZone } from "../types.js";

export type AgentCardSource = "manual" | "override" | "auto";

export interface AgentCardSnapshot {
  agentsMd: string;
  skillsMd: string;
  source: {
    agents: AgentCardSource;
    skills: AgentCardSource;
  };
}

export interface AgentCardProvider {
  getAgentCard(): Promise<AgentCardSnapshot>;
}

interface AgentCardDocument {
  title: string;
  name: string;
  sessionId: string;
  maxSteps: number;
  summary: string;
  instructions: string;
  tools: string[];
  generatedAt: string;
}

interface SkillsDocument {
  title: string;
  name: string;
  summary: string;
  skills: string[];
  generatedAt: string;
}

export interface AgentCardPluginOptions {
  paths?: {
    agents?: string;
    skills?: string;
  };
  readZones?: FilesystemZone[];
  overrides?: {
    agents?: string | Partial<AgentCardDocument>;
    skills?: string | Partial<SkillsDocument>;
  };
}

const DEFAULT_AGENTS_PATH = "agents.md";
const DEFAULT_SKILLS_PATH = "skills.md";
const DEFAULT_ZONES: FilesystemZone[] = ["persistent", "transient"];

export class AgentCardPlugin implements DeepAgentPlugin, AgentCardProvider {
  readonly name = "agent-card";
  readonly version = "1.0.0";
  readonly tools: Record<string, Tool>;

  private readonly options: Required<Pick<AgentCardPluginOptions, "paths" | "readZones">>
    & Pick<AgentCardPluginOptions, "overrides">;

  private setupCtx?: PluginSetupContext;
  private latestCtx?: PluginContext;

  readonly hooks = {
    beforeRun: async (ctx: PluginContext): Promise<void> => {
      this.latestCtx = ctx;
    },
    afterRun: async (ctx: PluginContext): Promise<void> => {
      this.latestCtx = ctx;
    },
  };

  constructor(options: AgentCardPluginOptions = {}) {
    this.options = {
      paths: {
        agents: options.paths?.agents ?? DEFAULT_AGENTS_PATH,
        skills: options.paths?.skills ?? DEFAULT_SKILLS_PATH,
      },
      readZones: options.readZones ?? DEFAULT_ZONES,
      overrides: options.overrides,
    };

    this.tools = {
      "agent-card:get": tool({
        description: "Return generated or manual agent card documents.",
        inputSchema: z.object({
          target: z.enum(["agents", "skills", "all"]).default("all"),
        }),
        execute: async (args: unknown) => {
          const parsed = z
            .object({ target: z.enum(["agents", "skills", "all"]).default("all") })
            .parse(args ?? {});

          const snapshot = await this.getAgentCard();

          if (parsed.target === "agents") {
            return {
              target: "agents",
              markdown: snapshot.agentsMd,
              source: snapshot.source.agents,
            };
          }

          if (parsed.target === "skills") {
            return {
              target: "skills",
              markdown: snapshot.skillsMd,
              source: snapshot.source.skills,
            };
          }

          return snapshot;
        },
      }),
    };
  }

  setup(ctx: PluginSetupContext): void {
    this.setupCtx = ctx;
  }

  async getAgentCard(): Promise<AgentCardSnapshot> {
    const ctx = this.latestCtx ?? this.setupCtx;
    if (!ctx) {
      throw new Error("AgentCardPlugin has not been initialized by a DeepAgent instance");
    }

    const agents = await this.resolveAgentsMarkdown(ctx);
    const skills = await this.resolveSkillsMarkdown(ctx);

    return {
      agentsMd: agents.markdown,
      skillsMd: skills.markdown,
      source: {
        agents: agents.source,
        skills: skills.source,
      },
    };
  }

  private async resolveAgentsMarkdown(
    ctx: PluginContext | PluginSetupContext,
  ): Promise<{ markdown: string; source: AgentCardSource }> {
    const manual = await this.tryReadManual(ctx, this.options.paths.agents);
    if (manual) return { markdown: manual, source: "manual" };

    const auto = this.createAutoAgentCard(ctx);
    const override = this.options.overrides?.agents;

    if (override !== undefined) {
      if (typeof override === "string") {
        return { markdown: override, source: "override" };
      }

      const merged = this.mergeAgentCard(auto, override);
      return { markdown: this.renderAgentCard(merged), source: "override" };
    }

    return { markdown: this.renderAgentCard(auto), source: "auto" };
  }

  private async resolveSkillsMarkdown(
    ctx: PluginContext | PluginSetupContext,
  ): Promise<{ markdown: string; source: AgentCardSource }> {
    const manual = await this.tryReadManual(ctx, this.options.paths.skills);
    if (manual) return { markdown: manual, source: "manual" };

    const auto = this.createAutoSkillsCard(ctx);
    const override = this.options.overrides?.skills;

    if (override !== undefined) {
      if (typeof override === "string") {
        return { markdown: override, source: "override" };
      }

      const merged = this.mergeSkillsCard(auto, override);
      return { markdown: this.renderSkillsCard(merged), source: "override" };
    }

    return { markdown: this.renderSkillsCard(auto), source: "auto" };
  }

  private async tryReadManual(
    ctx: PluginContext | PluginSetupContext,
    path: string,
  ): Promise<string | null> {
    for (const zone of this.options.readZones) {
      try {
        const exists = await ctx.filesystem.exists(path, zone);
        if (!exists) continue;
        return await ctx.filesystem.read(path, zone);
      } catch {
        // Ignore zone-level I/O errors and continue fallback order
      }
    }

    return null;
  }

  private createAutoAgentCard(ctx: PluginContext | PluginSetupContext): AgentCardDocument {
    const name = ctx.agentName ?? "DeepAgent";
    const tools = [...ctx.toolNames].sort();

    return {
      title: "Agent Card",
      name,
      sessionId: ctx.sessionId,
      maxSteps: ctx.config.maxSteps,
      summary: `${name} exposes ${tools.length} tool${tools.length === 1 ? "" : "s"}.`,
      instructions: ctx.config.instructions,
      tools,
      generatedAt: new Date().toISOString(),
    };
  }

  private createAutoSkillsCard(ctx: PluginContext | PluginSetupContext): SkillsDocument {
    const name = ctx.agentName ?? "DeepAgent";
    const skills = [...ctx.toolNames].sort();

    return {
      title: "Skills Card",
      name,
      summary: `${name} can invoke ${skills.length} callable skills/tools.`,
      skills,
      generatedAt: new Date().toISOString(),
    };
  }

  private mergeAgentCard(
    base: AgentCardDocument,
    override: Partial<AgentCardDocument>,
  ): AgentCardDocument {
    return {
      ...base,
      ...override,
      tools: override.tools ? [...override.tools] : base.tools,
    };
  }

  private mergeSkillsCard(
    base: SkillsDocument,
    override: Partial<SkillsDocument>,
  ): SkillsDocument {
    return {
      ...base,
      ...override,
      skills: override.skills ? [...override.skills] : base.skills,
    };
  }

  private renderAgentCard(doc: AgentCardDocument): string {
    const tools = doc.tools.length > 0
      ? doc.tools.map((toolName) => `- \`${toolName}\``)
      : ["- _No tools registered_"];

    return [
      `# ${doc.title}`,
      "",
      `- Name: ${doc.name}`,
      `- Session: ${doc.sessionId}`,
      `- Max Steps: ${doc.maxSteps}`,
      `- Generated At: ${doc.generatedAt}`,
      "",
      "## Summary",
      doc.summary,
      "",
      "## Instructions",
      doc.instructions,
      "",
      "## Tools",
      ...tools,
      "",
    ].join("\n");
  }

  private renderSkillsCard(doc: SkillsDocument): string {
    const skills = doc.skills.length > 0
      ? doc.skills.map((skill) => `- \`${skill}\``)
      : ["- _No skills registered_"];

    return [
      `# ${doc.title}`,
      "",
      `- Agent: ${doc.name}`,
      `- Generated At: ${doc.generatedAt}`,
      "",
      "## Summary",
      doc.summary,
      "",
      "## Skills",
      ...skills,
      "",
    ].join("\n");
  }
}

export function createAgentCardPlugin(options?: AgentCardPluginOptions): AgentCardPlugin {
  return new AgentCardPlugin(options);
}
