// =============================================================================
// Codemod — AST-free string-based code transformation framework
// =============================================================================

/**
 * A codemod is a named, reversible code transformation.
 */
export interface Codemod {
  /** Unique ID for this codemod */
  id: string;
  /** Human-readable description */
  description: string;
  /** Version migration path (e.g., "2.x → 3.x") */
  migration?: string;
  /** Transform a file's content. Return null to skip the file. */
  transform(content: string, filePath: string): string | null;
}

export interface CodemodResult {
  filePath: string;
  modified: boolean;
  /** Original content (for dry-run/undo) */
  original?: string;
  /** Transformed content */
  transformed?: string;
}

export interface CodemodRunnerOptions {
  /** Dry run — don't write changes (default: false) */
  dryRun?: boolean;
  /** File glob patterns to include (default: ["**\/*.ts", "**\/*.tsx"]) */
  include?: string[];
  /** File glob patterns to exclude (default: ["node_modules/**"]) */
  exclude?: string[];
}

/**
 * Run a set of codemods against file contents.
 * This is a pure function — doesn't touch the filesystem.
 * The caller is responsible for reading/writing files.
 */
export function runCodemods(
  codemods: Codemod[],
  files: Array<{ path: string; content: string }>,
): CodemodResult[] {
  const results: CodemodResult[] = [];

  for (const file of files) {
    let current = file.content;
    let modified = false;

    for (const mod of codemods) {
      const transformed = mod.transform(current, file.path);
      if (transformed !== null && transformed !== current) {
        current = transformed;
        modified = true;
      }
    }

    results.push({
      filePath: file.path,
      modified,
      original: modified ? file.content : undefined,
      transformed: modified ? current : undefined,
    });
  }

  return results;
}

// =============================================================================
// Built-in codemods for common Gauss migrations
// =============================================================================

/**
 * Rename imports from one package to another.
 */
export function createRenameImportCodemod(
  id: string,
  fromPkg: string,
  toPkg: string,
  description?: string,
): Codemod {
  const fromEscaped = fromPkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(from\\s+["'])${fromEscaped}(["'])`, "g");
  return {
    id,
    description: description ?? `Rename import "${fromPkg}" → "${toPkg}"`,
    transform(content) {
      const result = content.replace(regex, `$1${toPkg}$2`);
      return result !== content ? result : null;
    },
  };
}

/**
 * Rename an exported symbol.
 */
export function createRenameSymbolCodemod(
  id: string,
  fromName: string,
  toName: string,
  description?: string,
): Codemod {
  const regex = new RegExp(`\\b${fromName}\\b`, "g");
  return {
    id,
    description: description ?? `Rename symbol "${fromName}" → "${toName}"`,
    transform(content) {
      const result = content.replace(regex, toName);
      return result !== content ? result : null;
    },
  };
}

/**
 * Replace a deprecated API call with its replacement.
 */
export function createReplaceCallCodemod(
  id: string,
  fromCall: string,
  toCall: string,
  description?: string,
): Codemod {
  const fromEscaped = fromCall.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(fromEscaped, "g");
  return {
    id,
    description: description ?? `Replace "${fromCall}" → "${toCall}"`,
    transform(content) {
      const result = content.replace(regex, toCall);
      return result !== content ? result : null;
    },
  };
}

/**
 * Add an import if it doesn't exist yet.
 */
export function createAddImportCodemod(
  id: string,
  importStatement: string,
  description?: string,
): Codemod {
  return {
    id,
    description: description ?? `Add import: ${importStatement}`,
    transform(content) {
      if (content.includes(importStatement)) return null;
      return `${importStatement}\n${content}`;
    },
  };
}
