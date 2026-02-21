// =============================================================================
// Markdown Serializer — Human-readable CompilerOutput as SKILLS.md / AGENTS.md
// =============================================================================

import type { CompilerOutput, SkillDeclaration, AgentDeclaration, A2ARoute } from "../../domain/compiler.schema.js";
import type { SerializerPort, SerializerFormat } from "../../ports/serializer.port.js";

export class MarkdownSerializer implements SerializerPort {
  readonly format: SerializerFormat = "markdown";

  serialize(output: CompilerOutput): string {
    const sections: string[] = [
      this.renderHeader(output),
      this.renderSkills(output.skills),
      this.renderAgents(output.agents),
      this.renderRoutes(output.routes),
    ];

    return sections.join("\n\n");
  }

  private renderHeader(output: CompilerOutput): string {
    const lines = [`# ${output.workflow.name}`, ""];
    const decl = output.workflow.declaration;
    if (decl.description) lines.push(decl.description, "");

    const triggers = decl.triggers
      .map((t) => {
        if (t.type === "cron") return `Cron: \`${t.expression}\``;
        if (t.type === "event") return `Event: \`${t.event}\``;
        if (t.type === "webhook") return `Webhook: \`${t.path ?? "/webhook"}\``;
        return "Manual";
      })
      .join(", ");

    lines.push(`**Triggers:** ${triggers}`);

    if (decl.policy) {
      lines.push(`**Default Policy:** ${decl.policy.default}`);
    }

    return lines.join("\n");
  }

  private renderSkills(skills: SkillDeclaration[]): string {
    if (skills.length === 0) return "";

    const lines = ["## Skills", ""];

    for (const skill of skills) {
      lines.push(`### ${skill.id}`);
      lines.push("");
      lines.push(`- **Platform:** ${skill.platform}`);
      lines.push(`- **Description:** ${skill.description}`);
      lines.push(`- **Preconditions:** ${skill.preconditions}`);
      lines.push(`- **Existing:** ${skill.isExisting ? "Yes (reused)" : "No (new)"}`);
      if (skill.maxContentLength) {
        lines.push(`- **Max Length:** ${skill.maxContentLength}`);
      }
      lines.push("");
      lines.push("**Flow:**");
      for (const step of skill.flow) {
        lines.push(`1. ${step}`);
      }
      if (skill.notes.length > 0) {
        lines.push("");
        lines.push("**Notes:**");
        for (const note of skill.notes) {
          lines.push(`- ${note}`);
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderAgents(agents: AgentDeclaration[]): string {
    if (agents.length === 0) return "";

    const lines = ["## Agents", ""];

    for (const agent of agents) {
      lines.push(`### ${agent.id}`);
      lines.push("");
      lines.push(`- **Role:** ${agent.role}`);
      lines.push(`- **Skills:** ${agent.skills.join(", ")}`);
      if (agent.trigger) {
        const triggerStr =
          agent.trigger.type === "cron"
            ? `Cron \`${agent.trigger.expression}\``
            : agent.trigger.type;
        lines.push(`- **Trigger:** ${triggerStr}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderRoutes(routes: A2ARoute[]): string {
    if (routes.length === 0) return "";

    const lines = [
      "## A2A Routes",
      "",
      "| From | To | Event | Condition |",
      "|------|-----|-------|-----------|",
    ];

    for (const route of routes) {
      lines.push(
        `| ${route.from} | ${route.to} | \`${route.event}\` | ${route.condition ?? "-"} |`,
      );
    }

    return lines.join("\n");
  }
}
