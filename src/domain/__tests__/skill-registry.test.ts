// =============================================================================
// skill-registry.test.ts — Tests for InMemorySkillRegistry
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { InMemorySkillRegistry } from "../../adapters/compiler/inmemory-skill-registry.js";
import type { SkillMatcherPort } from "../../ports/skill-matcher.port.js";
import type { SkillDeclaration } from "../../domain/compiler.schema.js";

const linkedinSkill: SkillDeclaration = {
  id: "publish-linkedin",
  platform: "linkedin",
  description: "Publish articles to LinkedIn",
  preconditions: "OAuth token valid",
  flow: ["format", "publish"],
  notes: [],
  isExisting: true,
};

const xSkill: SkillDeclaration = {
  id: "publish-x",
  platform: "x",
  description: "Post to X (Twitter)",
  preconditions: "API key valid",
  flow: ["truncate to 280", "post"],
  notes: ["Max 280 chars"],
  maxContentLength: 280,
  isExisting: true,
};

const monitorSkill: SkillDeclaration = {
  id: "monitor-techcrunch",
  platform: "web",
  description: "Monitor TechCrunch for articles",
  preconditions: "URL accessible",
  flow: ["fetch", "extract", "fingerprint"],
  notes: [],
  isExisting: false,
};

describe("InMemorySkillRegistry", () => {
  it("should start empty", async () => {
    const registry = new InMemorySkillRegistry();
    const all = await registry.getAll();
    expect(all).toHaveLength(0);
  });

  it("should register and retrieve skills", async () => {
    const registry = new InMemorySkillRegistry();
    await registry.register(linkedinSkill);
    await registry.register(xSkill);

    const all = await registry.getAll();
    expect(all).toHaveLength(2);
  });

  it("should register many at once", async () => {
    const registry = new InMemorySkillRegistry();
    await registry.registerMany([linkedinSkill, xSkill, monitorSkill]);
    const all = await registry.getAll();
    expect(all).toHaveLength(3);
  });

  it("should check existence", async () => {
    const registry = new InMemorySkillRegistry();
    await registry.register(linkedinSkill);

    expect(await registry.exists("publish-linkedin")).toBe(true);
    expect(await registry.exists("nonexistent")).toBe(false);
  });

  it("should find by platform", async () => {
    const registry = new InMemorySkillRegistry();
    await registry.registerMany([linkedinSkill, xSkill, monitorSkill]);

    const linkedin = await registry.findByPlatformAndIntent("linkedin", "");
    expect(linkedin).toHaveLength(1);
    expect(linkedin[0].id).toBe("publish-linkedin");

    const web = await registry.findByPlatformAndIntent("web", "");
    expect(web).toHaveLength(1);
  });

  it("should find by platform and intent", async () => {
    const registry = new InMemorySkillRegistry();
    await registry.registerMany([linkedinSkill, xSkill, monitorSkill]);

    const result = await registry.findByPlatformAndIntent("linkedin", "publish");
    expect(result).toHaveLength(1);

    const noMatch = await registry.findByPlatformAndIntent("linkedin", "delete");
    expect(noMatch).toHaveLength(0);
  });

  it("should return empty matches without matcher", async () => {
    const registry = new InMemorySkillRegistry();
    await registry.register(linkedinSkill);

    const matches = await registry.findMatches(xSkill);
    expect(matches).toHaveLength(0);
  });

  it("should use matcher for semantic matching", async () => {
    const mockMatcher: SkillMatcherPort = {
      findMatches: vi.fn().mockResolvedValue([
        { skill: linkedinSkill, confidence: 0.92, reason: "Same platform and action" },
      ]),
    };

    const registry = new InMemorySkillRegistry(mockMatcher);
    await registry.register(linkedinSkill);

    const candidate: SkillDeclaration = {
      id: "post-to-linkedin",
      platform: "linkedin",
      description: "Post content to LinkedIn feed",
      preconditions: "Auth required",
      flow: ["format content", "call API"],
      notes: [],
      isExisting: false,
    };

    const matches = await registry.findMatches(candidate);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.92);
    expect(mockMatcher.findMatches).toHaveBeenCalledOnce();
  });
});
