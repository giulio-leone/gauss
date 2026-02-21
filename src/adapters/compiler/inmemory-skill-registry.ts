// =============================================================================
// InMemorySkillRegistry — Skill registry with matcher-based reuse detection
// =============================================================================

import type { SkillDeclaration } from "../../domain/compiler.schema.js";
import type { SkillRegistryPort } from "../../ports/compiler.port.js";
import type { SkillMatcherPort, SkillMatch } from "../../ports/skill-matcher.port.js";

export class InMemorySkillRegistry implements SkillRegistryPort {
  private readonly skills = new Map<string, SkillDeclaration>();
  private readonly matcher?: SkillMatcherPort;

  constructor(matcher?: SkillMatcherPort) {
    this.matcher = matcher;
  }

  async register(skill: SkillDeclaration): Promise<void> {
    this.skills.set(skill.id, skill);
  }

  async registerMany(skills: SkillDeclaration[]): Promise<void> {
    for (const skill of skills) {
      this.skills.set(skill.id, skill);
    }
  }

  async getAll(): Promise<SkillDeclaration[]> {
    return Array.from(this.skills.values());
  }

  async findByPlatformAndIntent(
    platform: string,
    intent: string,
  ): Promise<SkillDeclaration[]> {
    const allSkills = Array.from(this.skills.values());
    return allSkills.filter((s) => {
      if (s.platform !== platform) return false;
      if (!intent) return true;
      const lowerIntent = intent.toLowerCase();
      return (
        s.description.toLowerCase().includes(lowerIntent) ||
        s.id.toLowerCase().includes(lowerIntent)
      );
    });
  }

  async exists(skillId: string): Promise<boolean> {
    return this.skills.has(skillId);
  }

  /** Find existing skills that match a candidate (requires matcher) */
  async findMatches(
    candidate: SkillDeclaration,
    threshold?: number,
  ): Promise<SkillMatch[]> {
    if (!this.matcher) return [];
    const existingSkills = Array.from(this.skills.values());
    return this.matcher.findMatches(candidate, existingSkills, threshold);
  }
}
