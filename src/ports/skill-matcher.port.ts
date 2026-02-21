// =============================================================================
// Skill Matcher Port — Strategy for detecting skill reuse
// =============================================================================

import type { SkillDeclaration } from "../domain/compiler.schema.js";

export interface SkillMatch {
  skill: SkillDeclaration;
  confidence: number;
  reason: string;
}

export interface SkillMatcherPort {
  /** Find matching existing skills for a candidate skill declaration */
  findMatches(
    candidate: SkillDeclaration,
    existingSkills: SkillDeclaration[],
    threshold?: number,
  ): Promise<SkillMatch[]>;
}
