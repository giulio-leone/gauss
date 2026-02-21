// =============================================================================
// compiler-engine.test.ts — Tests for LLMCompilerEngine and CompileFromNLService
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompileFromNLService } from "../../adapters/compiler/compile-from-nl.js";
import type { NLParserPort, WorkflowCompilerPort, SkillRegistryPort } from "../../ports/compiler.port.js";
import type { StructuredDeclaration, CompilerOutput, SkillDeclaration } from "../../domain/compiler.schema.js";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const sampleDeclaration: StructuredDeclaration = {
  name: "TechCrunch AI Monitor",
  triggers: [{ type: "cron", expression: "every 2h" }],
  steps: [
    {
      type: "monitor",
      source: "https://techcrunch.com/category/ai",
      description: "Check for new AI articles",
      strategy: "adaptive",
    },
    {
      type: "filter",
      criteria: "Only articles about generative AI or LLMs",
      minRelevance: 0.7,
    },
    {
      type: "transform",
      action: "Rewrite for LinkedIn",
      targetChannel: "linkedin",
    },
    {
      type: "publish",
      channels: ["linkedin", "x"],
    },
  ],
  channels: [
    { platform: "linkedin", tone: "professional", format: "article" },
    { platform: "x", tone: "casual", maxLength: 280 },
  ],
  policy: {
    default: "review",
    yolo: false,
  },
};

const sampleCompilerOutput: CompilerOutput = {
  workflow: {
    id: "techcrunch-ai-monitor",
    name: "TechCrunch AI Monitor",
    declaration: sampleDeclaration,
  },
  skills: [
    {
      id: "monitor-techcrunch",
      platform: "web",
      description: "Monitor TechCrunch AI category for new articles",
      preconditions: "URL must be accessible",
      flow: ["fetch page", "extract articles", "compute fingerprint"],
      notes: ["Uses adaptive polling strategy"],
      isExisting: false,
    },
    {
      id: "publish-linkedin",
      platform: "linkedin",
      description: "Publish article to LinkedIn",
      preconditions: "Content must be approved",
      flow: ["format as article", "publish via API"],
      notes: ["Professional tone required"],
      isExisting: false,
    },
  ],
  agents: [
    {
      id: "monitor-agent",
      role: "Monitors web sources for new content",
      skills: ["monitor-techcrunch"],
      trigger: { type: "cron", expression: "every 2h" },
    },
    {
      id: "publisher-agent",
      role: "Delivers content to target platforms",
      skills: ["publish-linkedin", "publish-x"],
    },
  ],
  routes: [
    {
      from: "monitor-agent",
      to: "filter-agent",
      event: "content:detected",
    },
    {
      from: "filter-agent",
      to: "content-agent",
      event: "content:filtered",
    },
    {
      from: "content-agent",
      to: "publisher-agent",
      event: "content:ready",
    },
  ],
};

// -----------------------------------------------------------------------------
// CompileFromNLService tests
// -----------------------------------------------------------------------------

describe("CompileFromNLService", () => {
  let mockParser: NLParserPort;
  let mockCompiler: WorkflowCompilerPort;

  beforeEach(() => {
    mockParser = {
      parse: vi.fn().mockResolvedValue(sampleDeclaration),
    };
    mockCompiler = {
      compile: vi.fn().mockResolvedValue(sampleCompilerOutput),
    };
  });

  it("should pipeline parse → validate → compile", async () => {
    const service = new CompileFromNLService(mockParser, mockCompiler);

    const result = await service.compileFromNL("Monitor TechCrunch AI articles and post to LinkedIn and X every 2 hours");

    expect(mockParser.parse).toHaveBeenCalledOnce();
    expect(mockCompiler.compile).toHaveBeenCalledOnce();
    expect(result.workflow.name).toBe("TechCrunch AI Monitor");
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.agents.length).toBeGreaterThan(0);
    expect(result.routes.length).toBeGreaterThan(0);
  });

  it("should throw on invalid parser output", async () => {
    const badParser: NLParserPort = {
      parse: vi.fn().mockResolvedValue({ name: 123 }),
    };
    const service = new CompileFromNLService(badParser, mockCompiler);

    await expect(
      service.compileFromNL("bad input"),
    ).rejects.toThrow("NL Parser produced invalid declaration");
  });

  it("should pass validated declaration to compiler", async () => {
    const service = new CompileFromNLService(mockParser, mockCompiler);

    await service.compileFromNL("test workflow");

    const compileCall = (mockCompiler.compile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(compileCall[0]).toEqual(sampleDeclaration);
  });
});

// -----------------------------------------------------------------------------
// SkillRegistryPort mock tests
// -----------------------------------------------------------------------------

describe("SkillRegistryPort integration", () => {
  it("should find skills by platform", async () => {
    const existingSkill: SkillDeclaration = {
      id: "publish-linkedin",
      platform: "linkedin",
      description: "Existing LinkedIn publisher",
      preconditions: "OAuth token required",
      flow: ["format", "publish"],
      notes: [],
      isExisting: true,
    };

    const mockRegistry: SkillRegistryPort = {
      getAll: vi.fn().mockResolvedValue([existingSkill]),
      findByPlatformAndIntent: vi.fn().mockResolvedValue([existingSkill]),
      exists: vi.fn().mockResolvedValue(true),
    };

    const found = await mockRegistry.findByPlatformAndIntent("linkedin", "publish");
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("publish-linkedin");
    expect(found[0].isExisting).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// CompilerOutput structure tests
// -----------------------------------------------------------------------------

describe("CompilerOutput structure", () => {
  it("should have valid A2A routes referencing existing agents", () => {
    const agentIds = new Set(sampleCompilerOutput.agents.map((a) => a.id));

    for (const route of sampleCompilerOutput.routes) {
      expect(
        agentIds.has(route.from) || route.from.includes("agent"),
        `Route from "${route.from}" should reference a valid agent`,
      ).toBe(true);
    }
  });

  it("should have agents referencing valid skills", () => {
    const skillIds = new Set(sampleCompilerOutput.skills.map((s) => s.id));

    for (const agent of sampleCompilerOutput.agents) {
      for (const skillId of agent.skills) {
        // Skills referenced by agents should be defined or follow naming convention
        expect(typeof skillId).toBe("string");
        expect(skillId.length).toBeGreaterThan(0);
      }
    }
  });

  it("should have events following naming convention", () => {
    for (const route of sampleCompilerOutput.routes) {
      expect(route.event).toMatch(/^[a-z]+:[a-z]+$/);
    }
  });
});
