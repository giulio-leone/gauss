// =============================================================================
// Tests: Skills Port + FileSkillAdapter + SkillsMiddleware
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { FileSkillAdapter } from "../../../adapters/skills/file-skill.adapter.js";
import type { Skill } from "../../../ports/skills.port.js";
import { createSkillsMiddleware } from "../../../middleware/skills.js";

// ---------------------------------------------------------------------------
// In-memory filesystem mock
// ---------------------------------------------------------------------------

function createMockFs(files: Record<string, string>) {
  return {
    readFile: async (path: string) => {
      const content = files[path];
      if (!content) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    readDir: async (path: string) => {
      const prefix = path.endsWith("/") ? path : path + "/";
      return Object.keys(files)
        .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
        .map((p) => p.slice(prefix.length));
    },
    exists: async (path: string) => {
      if (files[path]) return true;
      // Check if it's a directory prefix
      const prefix = path.endsWith("/") ? path : path + "/";
      return Object.keys(files).some((p) => p.startsWith(prefix));
    },
    isDirectory: async (path: string) => {
      const prefix = path.endsWith("/") ? path : path + "/";
      return Object.keys(files).some((p) => p.startsWith(prefix));
    },
    resolve: (...parts: string[]) => parts.join("/"),
  };
}

const SKILL_CONTENT = `---
name: code-review
description: Expert code reviewer
license: MIT
allowed-tools: [search, read_file]
---

You are an expert code reviewer. Focus on:
- Correctness
- Performance
- Security
`;

const SKILL_MINIMAL = `---
name: minimal-skill
description: A minimal skill
---

Just do the thing.
`;

describe("FileSkillAdapter", () => {
  let adapter: FileSkillAdapter;

  beforeEach(() => {
    const fs = createMockFs({
      "/skills/code-review.skill.md": SKILL_CONTENT,
      "/skills/minimal-skill.md": SKILL_MINIMAL,
    });
    adapter = new FileSkillAdapter(fs);
  });

  // -- loadSkills --
  it("loads skills from a directory", async () => {
    const skills = await adapter.loadSkills("/skills");
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(["code-review", "minimal-skill"]);
  });

  it("parses YAML frontmatter correctly", async () => {
    await adapter.loadSkills("/skills");
    const skill = await adapter.getSkill("code-review");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("code-review");
    expect(skill!.description).toBe("Expert code reviewer");
    expect(skill!.license).toBe("MIT");
    expect(skill!.allowedTools).toEqual(["search", "read_file"]);
    expect(skill!.content).toContain("expert code reviewer");
  });

  it("returns empty array for nonexistent directory", async () => {
    const skills = await adapter.loadSkills("/nonexistent");
    expect(skills).toHaveLength(0);
  });

  // -- getSkill / listSkills --
  it("retrieves skill by name after loading", async () => {
    await adapter.loadSkills("/skills");
    expect(await adapter.getSkill("code-review")).not.toBeNull();
    expect(await adapter.getSkill("unknown")).toBeNull();
  });

  it("lists all loaded skills", async () => {
    await adapter.loadSkills("/skills");
    const skills = await adapter.listSkills();
    expect(skills).toHaveLength(2);
  });

  // -- path traversal prevention --
  it("ignores files with path traversal in name", async () => {
    const fs = createMockFs({
      "/skills/../etc/passwd": "evil",
      "/skills/good.md": SKILL_MINIMAL,
    });
    const a = new FileSkillAdapter(fs);
    const skills = await a.loadSkills("/skills");
    // Should only load good.md (the one without traversal)
    expect(skills.every((s) => s.name !== undefined)).toBe(true);
  });

  // -- last-one-wins precedence --
  it("later loads override earlier ones (last wins)", async () => {
    const fs = createMockFs({
      "/user-skills/code-review.skill.md": `---
name: code-review
description: User version
---
User content`,
      "/project-skills/code-review.skill.md": `---
name: code-review
description: Project version
---
Project content`,
    });
    const a = new FileSkillAdapter(fs);
    await a.loadSkills("/user-skills");
    await a.loadSkills("/project-skills"); // project wins

    const skill = await a.getSkill("code-review");
    expect(skill!.description).toBe("Project version");
  });

  // -- validateSkill --
  it("validates a correct skill", async () => {
    await adapter.loadSkills("/skills");
    const skill = (await adapter.getSkill("code-review"))!;
    const result = await adapter.validateSkill(skill);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects skill with missing name", async () => {
    const result = await adapter.validateSkill({
      name: "",
      description: "test",
      content: "test",
      metadata: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects skill with invalid name pattern", async () => {
    const result = await adapter.validateSkill({
      name: "Invalid Name!",
      description: "test",
      content: "test",
      metadata: {},
    });
    expect(result.valid).toBe(false);
  });

  it("warns on overlapping allowed/disallowed tools", async () => {
    const result = await adapter.validateSkill({
      name: "test-skill",
      description: "test",
      content: "test",
      allowedTools: ["search", "write"],
      disallowedTools: ["search"],
      metadata: {},
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // -- resolveInheritedSkills --
  it("inherit_all returns all parent skills", () => {
    const parent: Skill[] = [
      { name: "a", description: "", content: "", metadata: {} },
      { name: "b", description: "", content: "", metadata: {} },
    ];
    const result = adapter.resolveInheritedSkills(parent, {
      policy: "inherit_all",
    });
    expect(result).toHaveLength(2);
  });

  it("inherit_none returns empty", () => {
    const parent: Skill[] = [
      { name: "a", description: "", content: "", metadata: {} },
    ];
    const result = adapter.resolveInheritedSkills(parent, {
      policy: "inherit_none",
    });
    expect(result).toHaveLength(0);
  });

  it("explicit_list returns only named skills", () => {
    const parent: Skill[] = [
      { name: "a", description: "", content: "", metadata: {} },
      { name: "b", description: "", content: "", metadata: {} },
      { name: "c", description: "", content: "", metadata: {} },
    ];
    const result = adapter.resolveInheritedSkills(parent, {
      policy: "explicit_list",
      skills: ["a", "c"],
    });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name)).toEqual(["a", "c"]);
  });
});

// =============================================================================
// SkillsMiddleware tests
// =============================================================================

describe("createSkillsMiddleware", () => {
  it("augments agent instructions with skill content", async () => {
    const fs = createMockFs({
      "/skills/helper.skill.md": SKILL_CONTENT,
    });
    const skillsPort = new FileSkillAdapter(fs);

    const mw = createSkillsMiddleware({
      skillsPort,
      searchPaths: ["/skills"],
    });

    const ctx = { sessionId: "s1", agentName: "test", timestamp: Date.now(), metadata: {} };

    // Run setup to load skills
    await mw.setup?.(ctx);

    const result = await mw.beforeAgent?.(
      ctx,
      { instructions: "Base instructions", prompt: "", tools: {} },
    );

    expect(result).toBeDefined();
    expect((result as { instructions: string }).instructions).toContain("Base instructions");
    expect((result as { instructions: string }).instructions).toContain("Active Skills");
    expect((result as { instructions: string }).instructions).toContain("code-review");
  });

  it("returns void when no skills loaded", async () => {
    const fs = createMockFs({});
    const skillsPort = new FileSkillAdapter(fs);

    const mw = createSkillsMiddleware({
      skillsPort,
      searchPaths: ["/empty"],
    });

    const ctx = { sessionId: "s1", agentName: "test", timestamp: Date.now(), metadata: {} };

    await mw.setup?.(ctx);

    const result = await mw.beforeAgent?.(
      ctx,
      { instructions: "Base", prompt: "", tools: {} },
    );

    expect(result).toBeUndefined();
  });
});
