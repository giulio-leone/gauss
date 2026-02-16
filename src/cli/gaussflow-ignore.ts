// =============================================================================
// .gaussflowignore — Load and apply ignore patterns
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  "target",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
];

export function loadIgnorePatterns(cwd?: string): string[] {
  const dir = cwd || process.cwd();
  const ignorePath = join(dir, ".gaussflowignore");

  if (!existsSync(ignorePath)) {
    return [...DEFAULT_PATTERNS];
  }

  try {
    const content = readFileSync(ignorePath, "utf-8");
    const patterns = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    return patterns.length > 0 ? patterns : [...DEFAULT_PATTERNS];
  } catch {
    return [...DEFAULT_PATTERNS];
  }
}

export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const segments = filePath.split(/[/\\]/);
  for (const pattern of patterns) {
    // Check if any path segment matches the pattern exactly
    if (segments.includes(pattern)) return true;
    // Check if the full path starts with the pattern as a complete segment
    if (filePath === pattern || filePath.startsWith(pattern + "/") || filePath.startsWith(pattern + "\\")) return true;
  }
  return false;
}
