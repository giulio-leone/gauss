// =============================================================================
// Project Context Detection — Detect project type, framework, and structure
// =============================================================================

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

export interface ProjectContext {
  type: string;
  framework?: string;
  language: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: string[];
  structure: string;
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "__pycache__",
  "target", ".next", ".nuxt", "coverage", ".turbo", ".cache",
  "venv", ".venv", "env", ".env",
]);

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function listTopLevelDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORED_DIRS.has(e.name))
      .map((e) => e.name + "/")
      .slice(0, 20);
  } catch {
    return [];
  }
}

function detectNodeFramework(deps: Record<string, unknown>): string | undefined {
  if ("next" in deps) return "next.js";
  if ("nuxt" in deps || "nuxt3" in deps) return "nuxt";
  if ("@angular/core" in deps) return "angular";
  if ("svelte" in deps || "@sveltejs/kit" in deps) return "svelte";
  if ("vue" in deps) return "vue";
  if ("express" in deps) return "express";
  if ("fastify" in deps) return "fastify";
  if ("hono" in deps) return "hono";
  if ("koa" in deps) return "koa";
  if ("nestjs" in deps || "@nestjs/core" in deps) return "nestjs";
  return undefined;
}

function detectNodeLanguage(dir: string, pkg: Record<string, unknown>): string {
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, unknown>;
  const deps = (pkg.dependencies ?? {}) as Record<string, unknown>;
  if ("typescript" in devDeps || "typescript" in deps) return "typescript";
  if (existsSync(join(dir, "tsconfig.json"))) return "typescript";
  return "javascript";
}

function detectPackageManager(dir: string): string {
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun";
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

function extractTopDeps(pkg: Record<string, unknown>, max = 10): string[] {
  const deps = (pkg.dependencies ?? {}) as Record<string, unknown>;
  return Object.keys(deps).slice(0, max);
}

function detectNodeProject(dir: string, pkg: Record<string, unknown>): ProjectContext {
  const allDeps = {
    ...((pkg.dependencies ?? {}) as Record<string, unknown>),
    ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
  };
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const pickedScripts: Record<string, string> = {};
  for (const key of ["test", "build", "lint", "dev", "start"]) {
    if (scripts[key]) pickedScripts[key] = scripts[key];
  }

  return {
    type: "node",
    framework: detectNodeFramework(allDeps),
    language: detectNodeLanguage(dir, pkg),
    packageManager: detectPackageManager(dir),
    scripts: Object.keys(pickedScripts).length > 0 ? pickedScripts : undefined,
    dependencies: extractTopDeps(pkg),
    structure: listTopLevelDirs(dir).join(", ") || "(empty)",
  };
}

function detectPythonFramework(dir: string): string | undefined {
  // Check pyproject.toml or requirements.txt for common frameworks
  for (const file of ["pyproject.toml", "requirements.txt"]) {
    try {
      const content = readFileSync(join(dir, file), "utf-8");
      if (content.includes("django") || content.includes("Django")) return "django";
      if (content.includes("flask") || content.includes("Flask")) return "flask";
      if (content.includes("fastapi") || content.includes("FastAPI")) return "fastapi";
    } catch { /* skip */ }
  }
  return undefined;
}

export function detectProjectContext(cwd?: string): ProjectContext {
  const dir = cwd || process.cwd();
  const dirs = listTopLevelDirs(dir);
  const structure = dirs.join(", ") || "(empty)";

  // Node.js
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = readJson(pkgPath);
    if (pkg) return detectNodeProject(dir, pkg);
  }

  // Python
  if (existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "requirements.txt"))) {
    return {
      type: "python",
      framework: detectPythonFramework(dir),
      language: "python",
      packageManager: "pip",
      structure,
    };
  }

  // Rust
  if (existsSync(join(dir, "Cargo.toml"))) {
    return { type: "rust", language: "rust", packageManager: "cargo", structure };
  }

  // Go
  if (existsSync(join(dir, "go.mod"))) {
    return { type: "go", language: "go", packageManager: "go", structure };
  }

  // Java
  if (existsSync(join(dir, "pom.xml"))) {
    return { type: "java", language: "java", packageManager: "maven", structure };
  }
  if (existsSync(join(dir, "build.gradle")) || existsSync(join(dir, "build.gradle.kts"))) {
    return { type: "java", language: "java", packageManager: "gradle", structure };
  }

  return { type: "unknown", language: "unknown", structure };
}

export function contextToSystemPrompt(ctx: ProjectContext): string {
  const parts: string[] = [];

  if (ctx.type === "unknown") {
    parts.push("Project type could not be detected.");
  } else {
    const frameworkPart = ctx.framework ? ` using ${ctx.framework} framework` : "";
    parts.push(`This is a ${ctx.language}/${ctx.type} project${frameworkPart}.`);
  }

  if (ctx.packageManager) {
    parts.push(`Package manager: ${ctx.packageManager}.`);
  }

  if (ctx.dependencies && ctx.dependencies.length > 0) {
    parts.push(`Key dependencies: ${ctx.dependencies.join(", ")}.`);
  }

  if (ctx.scripts) {
    const scriptEntries = Object.entries(ctx.scripts)
      .map(([k, v]) => `${k}: \`${v}\``)
      .join(", ");
    parts.push(`Scripts: ${scriptEntries}.`);
  }

  if (ctx.structure && ctx.structure !== "(empty)") {
    parts.push(`Project structure: ${ctx.structure}`);
  }

  return parts.join(" ");
}
