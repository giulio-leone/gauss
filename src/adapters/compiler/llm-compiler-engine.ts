// =============================================================================
// LLM Compiler Engine — Compiles StructuredDeclaration into executable artifacts
// Uses Gauss Agent + AI SDK Output.object for LLM-assisted compilation
// with Zod schema enforcement for deterministic structure.
// =============================================================================

import { Output } from "ai";
import type { LanguageModel } from "ai";
import {
  CompilerOutputSchema,
  type StructuredDeclaration,
  type CompilerOutput,
  type LLMCompilerOutput,
} from "../../domain/compiler.schema.js";
import type { WorkflowCompilerPort, SkillRegistryPort } from "../../ports/compiler.port.js";
import { Agent } from "../../agent/agent.js";

// -----------------------------------------------------------------------------
// Compiler system prompt
// -----------------------------------------------------------------------------

function buildCompilerPrompt(existingSkills: string[]): string {
  const skillsList = existingSkills.length > 0
    ? `\n\nExisting skills in the registry (reuse these when possible, set isExisting=true):\n${existingSkills.map((s) => `- ${s}`).join("\n")}`
    : "";

  return `You are a workflow compiler. Given a StructuredDeclaration (workflow IR), generate the skills, agents, and A2A routes needed to execute it.

## Agent Grouping Strategy: Role-Based
Group steps into agents by their logical role:
- **monitor-agent**: All monitor steps → detects new content from sources
- **filter-agent**: All filter steps → evaluates relevance and applies criteria
- **content-agent**: All transform steps → rewrites/adapts content for channels
- **publisher-agent**: All publish steps → delivers content to platforms
- **custom-agent**: Custom steps that don't fit other roles

If a workflow has multiple steps of the same type, they share one agent with multiple skills.

## Skill Generation Rules
- Each step maps to one or more skills
- Skill IDs follow the pattern: \`{action}-{target}\` (e.g. \`monitor-techcrunch\`, \`publish-linkedin\`, \`transform-x\`)
- Include platform-specific constraints in notes (X=280 chars, LinkedIn=article format)
- Set \`isExisting: true\` only for skills that match existing ones in the registry
- \`flow\` should list concrete ordered actions (e.g. ["fetch page", "extract articles", "compute fingerprint", "compare with last snapshot"])
- \`preconditions\` should state what's needed (e.g. "URL must be accessible", "content must pass relevance filter")

## A2A Route Rules
- Routes follow the pipeline order: monitor → filter → content → publisher
- Event names follow the pattern: \`{stage}:{action}\` (e.g. \`content:detected\`, \`content:filtered\`, \`content:ready\`, \`content:published\`)
- Add conditions when policy dictates (e.g. review mode adds a "content:approved" route)
- If policy.default is "review", add an extra route for human approval between content-agent and publisher-agent${skillsList}`;
}

// -----------------------------------------------------------------------------
// LLM Compiler Engine
// -----------------------------------------------------------------------------

export class LLMCompilerEngine implements WorkflowCompilerPort {
  constructor(
    private readonly model: LanguageModel,
    private readonly skillRegistry?: SkillRegistryPort,
  ) {}

  async compile(declaration: StructuredDeclaration): Promise<CompilerOutput> {
    const existingSkills = await this.resolveExistingSkills(declaration);

    const compilationPrompt = this.buildPrompt(declaration);

    const agent = Agent.create({
      model: this.model,
      instructions: buildCompilerPrompt(existingSkills),
      maxSteps: 1,
    })
      .withOutput(Output.object({ schema: CompilerOutputSchema }))
      .build();

    const result = await agent.run(compilationPrompt);

    if (!result.output) {
      throw new Error("Compiler Engine: LLM did not produce structured output");
    }

    const llmOutput = result.output as LLMCompilerOutput;

    const workflowId = declaration.id ?? this.generateId(declaration.name);

    return {
      workflow: {
        id: workflowId,
        name: declaration.name,
        declaration,
      },
      skills: llmOutput.skills,
      agents: llmOutput.agents,
      routes: llmOutput.routes,
    };
  }

  private buildPrompt(declaration: StructuredDeclaration): string {
    return `Compile this workflow declaration into skills, agents, and A2A routes:

\`\`\`json
${JSON.stringify(declaration, null, 2)}
\`\`\`

Analyze the steps, identify required skills per platform, group into role-based agents, and define the A2A communication routes following the pipeline pattern.`;
  }

  private async resolveExistingSkills(declaration: StructuredDeclaration): Promise<string[]> {
    if (!this.skillRegistry) return [];

    const platforms = new Set<string>();
    for (const step of declaration.steps) {
      if (step.type === "publish" && "channels" in step) {
        step.channels.forEach((ch) => platforms.add(ch));
      }
      if (step.type === "transform" && step.targetChannel) {
        platforms.add(step.targetChannel);
      }
      if (step.type === "monitor") {
        platforms.add("web");
      }
    }

    const skills: string[] = [];
    for (const platform of platforms) {
      const found = await this.skillRegistry.findByPlatformAndIntent(platform, "");
      skills.push(...found.map((s) => `${s.id}: ${s.description}`));
    }

    return skills;
  }

  private generateId(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);

    const suffix = Date.now().toString(36);
    const base = slug || "workflow";
    return `${base}-${suffix}`;
  }
}
