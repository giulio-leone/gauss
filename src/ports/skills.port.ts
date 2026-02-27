// =============================================================================
// SkillsPort — Loadable, discoverable, inheritable skills system
// =============================================================================

// =============================================================================
// Skill schema
// =============================================================================

export interface Skill {
  /** Skill name (kebab-case, max 64 chars) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Skill content (system prompt / instructions) */
  content: string;
  /** Skill source path or URL */
  source?: string;
  /** License identifier */
  license?: string;
  /** Allowed tools (empty = all) */
  allowedTools?: string[];
  /** Disallowed tools */
  disallowedTools?: string[];
  /** Compatibility constraints */
  compatibility?: {
    minVersion?: string;
    maxVersion?: string;
    runtimes?: string[];
  };
  /** Custom metadata */
  metadata: Record<string, unknown>;
}

export type SkillInheritancePolicy =
  | "inherit_all"
  | "inherit_none"
  | "explicit_list";

export interface SkillInheritanceConfig {
  policy: SkillInheritancePolicy;
  /** Explicit skill names to inherit (only used with "explicit_list") */
  skills?: string[];
}

// =============================================================================
// Validation
// =============================================================================

export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// Port interface
// =============================================================================

export interface SkillsPort {
  /** Load skills from a source (directory, URL, etc.) */
  loadSkills(source: string): Promise<Skill[]>;

  /** Get a specific skill by name */
  getSkill(name: string): Promise<Skill | null>;

  /** List all available skills */
  listSkills(): Promise<Skill[]>;

  /** Validate a skill against the schema */
  validateSkill(skill: Skill): Promise<SkillValidationResult>;

  /** Resolve skills for a subagent based on inheritance policy */
  resolveInheritedSkills(
    parentSkills: Skill[],
    config: SkillInheritanceConfig,
  ): Skill[];
}
