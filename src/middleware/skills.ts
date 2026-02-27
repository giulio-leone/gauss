// =============================================================================
// SkillsMiddleware — Loads skills into agent system prompt
// =============================================================================

import type {
  MiddlewarePort,
  MiddlewareContext,
  BeforeAgentParams,
  BeforeAgentResult,
} from "../ports/middleware.port.js";
import { MiddlewarePriority } from "../ports/middleware.port.js";
import type { SkillsPort, Skill, SkillInheritanceConfig } from "../ports/skills.port.js";

export interface SkillsMiddlewareOptions {
  /** Skills port to load skills from */
  skillsPort: SkillsPort;
  /** Directories to scan for skills */
  searchPaths?: string[];
  /** Inheritance config for subagents */
  inheritanceConfig?: SkillInheritanceConfig;
}

export function createSkillsMiddleware(
  options: SkillsMiddlewareOptions,
): MiddlewarePort {
  let loadedSkills: Skill[] = [];

  return {
    name: "gauss:skills",
    priority: MiddlewarePriority.EARLY,

    async setup(_ctx: MiddlewareContext) {
      // Load skills from all search paths
      for (const path of options.searchPaths ?? []) {
        const skills = await options.skillsPort.loadSkills(path);
        loadedSkills.push(...skills);
      }
      // Deduplicate by name (last wins)
      const seen = new Map<string, Skill>();
      for (const skill of loadedSkills) {
        seen.set(skill.name, skill);
      }
      loadedSkills = Array.from(seen.values());
    },

    async beforeAgent(
      _ctx: MiddlewareContext,
      params: BeforeAgentParams,
    ): Promise<BeforeAgentResult | void> {
      if (loadedSkills.length === 0) return;

      const skillsBlock = loadedSkills
        .map((s) => `## Skill: ${s.name}\n${s.description}\n\n${s.content}`)
        .join("\n\n---\n\n");

      const augmented = `${params.instructions}\n\n# Active Skills\n\n${skillsBlock}`;
      return { instructions: augmented };
    },
  };
}
