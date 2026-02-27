// =============================================================================
// FileSkillAdapter — Loads skills from SKILL.md files with YAML frontmatter
// =============================================================================

import type {
  SkillsPort,
  Skill,
  SkillValidationResult,
  SkillInheritanceConfig,
} from "../../ports/skills.port.js";

const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;

export interface FileSkillAdapterOptions {
  /** Base directories to scan for skills (in order of precedence) */
  searchPaths?: string[];
  /** Filesystem read function */
  readFile: (path: string) => Promise<string>;
  /** List directory entries */
  readDir: (path: string) => Promise<string[]>;
  /** Check if path exists */
  exists: (path: string) => Promise<boolean>;
  /** Resolve path safely */
  resolve: (...parts: string[]) => string;
  /** Check if path is a directory */
  isDirectory: (path: string) => Promise<boolean>;
}

export class FileSkillAdapter implements SkillsPort {
  private readonly skills = new Map<string, Skill>();
  private readonly opts: FileSkillAdapterOptions;

  constructor(options: FileSkillAdapterOptions) {
    this.opts = options;
  }

  async loadSkills(source: string): Promise<Skill[]> {
    const dirExists = await this.opts.exists(source);
    if (!dirExists) return [];

    const isDir = await this.opts.isDirectory(source);
    if (!isDir) {
      // Single file
      const skill = await this.loadSkillFile(source);
      if (skill) {
        this.skills.set(skill.name, skill);
        return [skill];
      }
      return [];
    }

    const entries = await this.opts.readDir(source);
    const loaded: Skill[] = [];

    for (const entry of entries) {
      if (!entry.endsWith(".md") && !entry.endsWith(".skill.md")) continue;
      // Path traversal prevention
      if (entry.includes("..") || entry.startsWith("/")) continue;

      const fullPath = this.opts.resolve(source, entry);
      const skill = await this.loadSkillFile(fullPath);
      if (skill) {
        // Last-one-wins: project > user
        this.skills.set(skill.name, skill);
        loaded.push(skill);
      }
    }

    return loaded;
  }

  async getSkill(name: string): Promise<Skill | null> {
    return this.skills.get(name) ?? null;
  }

  async listSkills(): Promise<Skill[]> {
    return Array.from(this.skills.values());
  }

  async validateSkill(skill: Skill): Promise<SkillValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!skill.name) {
      errors.push("Skill name is required");
    } else {
      if (!SKILL_NAME_REGEX.test(skill.name)) {
        errors.push(`Skill name must match pattern: ${SKILL_NAME_REGEX.source}`);
      }
      if (skill.name.length > MAX_NAME_LENGTH) {
        errors.push(`Skill name must be at most ${MAX_NAME_LENGTH} characters`);
      }
    }

    if (!skill.description) {
      errors.push("Skill description is required");
    }

    if (!skill.content || skill.content.trim().length === 0) {
      errors.push("Skill content is required");
    }

    if (skill.allowedTools && skill.disallowedTools) {
      const overlap = skill.allowedTools.filter((t) => skill.disallowedTools!.includes(t));
      if (overlap.length > 0) {
        warnings.push(`Tools in both allowed and disallowed: ${overlap.join(", ")}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  resolveInheritedSkills(
    parentSkills: Skill[],
    config: SkillInheritanceConfig,
  ): Skill[] {
    switch (config.policy) {
      case "inherit_all":
        return [...parentSkills];
      case "inherit_none":
        return [];
      case "explicit_list":
        return parentSkills.filter((s) => config.skills?.includes(s.name));
    }
  }

  // ---------------------------------------------------------------------------
  // Internal — parse SKILL.md with YAML frontmatter
  // ---------------------------------------------------------------------------

  private async loadSkillFile(path: string): Promise<Skill | null> {
    try {
      const content = await this.opts.readFile(path);
      return this.parseSkillMd(content, path);
    } catch {
      return null;
    }
  }

  private parseSkillMd(raw: string, source: string): Skill | null {
    const { frontmatter, content } = parseFrontmatter(raw);
    if (!frontmatter.name || !content) return null;

    return {
      name: String(frontmatter.name),
      description: String(frontmatter.description ?? ""),
      content: content.trim(),
      source,
      license: frontmatter.license ? String(frontmatter.license) : undefined,
      allowedTools: parseStringArray(frontmatter["allowed-tools"]),
      disallowedTools: parseStringArray(frontmatter["disallowed-tools"]),
      compatibility: frontmatter.compatibility
        ? {
            minVersion: (frontmatter.compatibility as Record<string, unknown>).minVersion as string | undefined,
            maxVersion: (frontmatter.compatibility as Record<string, unknown>).maxVersion as string | undefined,
            runtimes: parseStringArray((frontmatter.compatibility as Record<string, unknown>).runtimes),
          }
        : undefined,
      metadata: (frontmatter.metadata as Record<string, unknown>) ?? {},
    };
  }
}

// =============================================================================
// Minimal YAML frontmatter parser (no dependencies)
// =============================================================================

function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: raw };
  }

  const yamlBlock = match[1];
  const content = match[2];
  const frontmatter: Record<string, unknown> = {};

  // Simple key: value parser (handles strings, arrays, nested objects)
  let currentObject: Record<string, unknown> | null = null;

  for (const line of yamlBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (indent > 0 && currentObject !== null) {
      // Nested property
      if (value.startsWith("[") && value.endsWith("]")) {
        currentObject[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else {
        currentObject[key] = value.replace(/^["']|["']$/g, "");
      }
    } else if (value === "") {
      // Start of a nested object
      currentObject = {};
      frontmatter[key] = currentObject;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      // Inline array: [a, b, c]
      currentObject = null;
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      currentObject = null;
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter, content };
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(",").map((s) => s.trim());
  return undefined;
}
