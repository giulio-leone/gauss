// =============================================================================
// WorkflowCompilerPort — Contract for workflow compilation
// =============================================================================

import type {
  StructuredDeclaration,
  CompilerOutput,
  SkillDeclaration,
} from "../domain/compiler.schema.js";

// -----------------------------------------------------------------------------
// Compiler port
// -----------------------------------------------------------------------------

export interface NLParserPort {
  /** Parse natural language into a StructuredDeclaration */
  parse(naturalLanguage: string): Promise<StructuredDeclaration>;
}

export interface WorkflowCompilerPort {
  /** Compile a StructuredDeclaration into executable artifacts */
  compile(declaration: StructuredDeclaration): Promise<CompilerOutput>;
}

export interface CompileFromNLPort {
  /** Full pipeline: NL → parse → compile → output */
  compileFromNL(naturalLanguage: string): Promise<CompilerOutput>;
}

// -----------------------------------------------------------------------------
// Skill registry port (for reuse detection)
// -----------------------------------------------------------------------------

export interface SkillRegistryPort {
  /** Get all registered skills */
  getAll(): Promise<SkillDeclaration[]>;

  /** Find skills matching a platform and intent */
  findByPlatformAndIntent(platform: string, intent: string): Promise<SkillDeclaration[]>;

  /** Check if a skill with this ID exists */
  exists(skillId: string): Promise<boolean>;
}

// -----------------------------------------------------------------------------
// Storage port
// -----------------------------------------------------------------------------

export type StorageStrategy = "db" | "file" | "dual";

export interface StoredWorkflow {
  id: string;
  name: string;
  declaration: StructuredDeclaration;
  output: CompilerOutput;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStoragePort {
  save(workflow: StoredWorkflow): Promise<void>;
  load(id: string): Promise<StoredWorkflow | null>;
  list(): Promise<StoredWorkflow[]>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
}
