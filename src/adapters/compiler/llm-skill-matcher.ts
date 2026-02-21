// =============================================================================
// LLM Skill Matcher — Uses DeepAgent + Output.object for semantic skill matching
// =============================================================================

import { Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import type { SkillDeclaration } from "../../domain/compiler.schema.js";
import type { SkillMatcherPort, SkillMatch } from "../../ports/skill-matcher.port.js";
import { DeepAgent } from "../../agent/deep-agent.js";

// Zod schema for LLM match result
const MatchResultSchema = z.object({
  matches: z.array(
    z.object({
      existingSkillId: z.string().describe("ID of the matching existing skill"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Match confidence (0=completely different, 1=identical)"),
      reason: z.string().describe("Brief explanation of why this is a match"),
    }),
  ),
});

const MATCHER_PROMPT = `You are a skill matching engine. Given a candidate skill and a list of existing skills, determine which existing skills are functionally equivalent or very similar to the candidate.

Rules:
- Match based on FUNCTIONAL equivalence, not naming
- Consider: platform, description, flow steps, preconditions
- A skill that publishes to LinkedIn via API is the same regardless of its name
- Return confidence 0.9+ for near-identical skills (same platform, same actions)
- Return confidence 0.7-0.9 for similar skills (same platform, different approach)
- Return confidence 0.5-0.7 for partially overlapping skills
- Only return matches above the minimum confidence threshold
- If no matches found, return empty array`;

export class LLMSkillMatcher implements SkillMatcherPort {
  constructor(private readonly model: LanguageModel) {}

  async findMatches(
    candidate: SkillDeclaration,
    existingSkills: SkillDeclaration[],
    threshold = 0.7,
  ): Promise<SkillMatch[]> {
    if (existingSkills.length === 0) return [];

    const prompt = `Candidate skill:
${JSON.stringify(candidate, null, 2)}

Existing skills:
${JSON.stringify(existingSkills, null, 2)}

Minimum confidence threshold: ${threshold}

Find all existing skills that match the candidate.`;

    const agent = DeepAgent.create({
      model: this.model,
      instructions: MATCHER_PROMPT,
      maxSteps: 1,
    })
      .withOutput(Output.object({ schema: MatchResultSchema }))
      .build();

    const result = await agent.run(prompt);

    if (!result.output) return [];

    const output = result.output as z.infer<typeof MatchResultSchema>;

    return output.matches
      .filter((m) => m.confidence >= threshold)
      .map((m) => {
        const existingSkill = existingSkills.find((s) => s.id === m.existingSkillId);
        if (!existingSkill) return null;
        return {
          skill: existingSkill,
          confidence: m.confidence,
          reason: m.reason,
        };
      })
      .filter((m): m is SkillMatch => m !== null);
  }
}
