// =============================================================================
// Tests — Project Context Detection & Gaussflow Ignore
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:fs before importing modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { detectProjectContext, contextToSystemPrompt, type ProjectContext } from "../project-context.js";
import { loadIgnorePatterns, shouldIgnore } from "../gauss-ignore.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

beforeEach(() => {
  vi.resetAllMocks();
  mockReaddirSync.mockReturnValue([]);
});

// =============================================================================
// detectProjectContext
// =============================================================================

describe("detectProjectContext", () => {
  it("detects a Node.js project with package.json", () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith("package.json"));
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: "my-app",
      dependencies: { express: "^4.0.0" },
      devDependencies: {},
      scripts: { test: "vitest", build: "tsc" },
    }));

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("node");
    expect(ctx.language).toBe("javascript");
    expect(ctx.framework).toBe("express");
    expect(ctx.scripts).toEqual({ test: "vitest", build: "tsc" });
    expect(ctx.dependencies).toContain("express");
  });

  it("detects TypeScript when tsconfig.json exists", () => {
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      return s.endsWith("package.json") || s.endsWith("tsconfig.json");
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: "ts-app",
      dependencies: {},
      devDependencies: {},
    }));

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.language).toBe("typescript");
  });

  it("detects Next.js framework from dependencies", () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith("package.json"));
    mockReadFileSync.mockReturnValue(JSON.stringify({
      dependencies: { next: "14.0.0", react: "18.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    }));

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("node");
    expect(ctx.framework).toBe("next.js");
    expect(ctx.language).toBe("typescript");
  });

  it("detects a Python project with requirements.txt", () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith("requirements.txt"));
    mockReadFileSync.mockReturnValue("flask==2.0\nrequests==2.28\n");

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("python");
    expect(ctx.language).toBe("python");
    expect(ctx.framework).toBe("flask");
    expect(ctx.packageManager).toBe("pip");
  });

  it("detects a Python project with pyproject.toml", () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith("pyproject.toml"));
    mockReadFileSync.mockReturnValue('[tool.poetry]\nname = "myapp"\n');

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("python");
    expect(ctx.language).toBe("python");
  });

  it("detects a Rust project", () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith("Cargo.toml"));

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("rust");
    expect(ctx.language).toBe("rust");
    expect(ctx.packageManager).toBe("cargo");
  });

  it("detects a Go project", () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith("go.mod"));

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("go");
    expect(ctx.language).toBe("go");
    expect(ctx.packageManager).toBe("go");
  });

  it("detects a Java Maven project", () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith("pom.xml"));

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("java");
    expect(ctx.language).toBe("java");
    expect(ctx.packageManager).toBe("maven");
  });

  it("detects a Java Gradle project", () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith("build.gradle"));

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("java");
    expect(ctx.packageManager).toBe("gradle");
  });

  it("returns unknown when no markers found", () => {
    mockExistsSync.mockReturnValue(false);

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.type).toBe("unknown");
    expect(ctx.language).toBe("unknown");
  });

  it("detects pnpm package manager", () => {
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      return s.endsWith("package.json") || s.endsWith("pnpm-lock.yaml");
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      dependencies: {},
      devDependencies: {},
    }));

    const ctx = detectProjectContext("/fake/dir");
    expect(ctx.packageManager).toBe("pnpm");
  });
});

// =============================================================================
// contextToSystemPrompt
// =============================================================================

describe("contextToSystemPrompt", () => {
  it("generates readable text for a Node.js project", () => {
    const ctx: ProjectContext = {
      type: "node",
      framework: "next.js",
      language: "typescript",
      packageManager: "pnpm",
      dependencies: ["react", "next", "tailwindcss"],
      scripts: { test: "vitest", build: "next build" },
      structure: "src/, pages/, public/",
    };
    const prompt = contextToSystemPrompt(ctx);
    expect(prompt).toContain("typescript/node");
    expect(prompt).toContain("next.js");
    expect(prompt).toContain("pnpm");
    expect(prompt).toContain("react");
    expect(prompt).toContain("src/, pages/, public/");
  });

  it("handles unknown project type", () => {
    const ctx: ProjectContext = {
      type: "unknown",
      language: "unknown",
      structure: "(empty)",
    };
    const prompt = contextToSystemPrompt(ctx);
    expect(prompt).toContain("could not be detected");
  });

  it("handles project with no deps or scripts", () => {
    const ctx: ProjectContext = {
      type: "rust",
      language: "rust",
      packageManager: "cargo",
      structure: "src/",
    };
    const prompt = contextToSystemPrompt(ctx);
    expect(prompt).toContain("rust/rust");
    expect(prompt).toContain("cargo");
    expect(prompt).not.toContain("dependencies");
    expect(prompt).not.toContain("Scripts");
  });
});

// =============================================================================
// loadIgnorePatterns
// =============================================================================

describe("loadIgnorePatterns", () => {
  it("returns default patterns when no .gaussignore exists", () => {
    mockExistsSync.mockReturnValue(false);

    const patterns = loadIgnorePatterns("/fake/dir");
    expect(patterns).toContain("node_modules");
    expect(patterns).toContain(".git");
    expect(patterns).toContain("dist");
  });

  it("loads patterns from .gaussignore file", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("vendor\ntmp\n# comment\n\nsecrets\n");

    const patterns = loadIgnorePatterns("/fake/dir");
    expect(patterns).toEqual(["vendor", "tmp", "secrets"]);
    expect(patterns).not.toContain("# comment");
  });

  it("returns defaults for empty .gaussignore", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("\n\n");

    const patterns = loadIgnorePatterns("/fake/dir");
    expect(patterns).toContain("node_modules");
  });
});

// =============================================================================
// shouldIgnore
// =============================================================================

describe("shouldIgnore", () => {
  const patterns = ["node_modules", ".git", "dist", "build"];

  it("matches path segments", () => {
    expect(shouldIgnore("node_modules/foo/bar.js", patterns)).toBe(true);
    expect(shouldIgnore("src/node_modules/pkg", patterns)).toBe(true);
    expect(shouldIgnore("dist/index.js", patterns)).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(shouldIgnore("src/index.ts", patterns)).toBe(false);
    expect(shouldIgnore("lib/utils.js", patterns)).toBe(false);
  });

  it("matches path starting with pattern", () => {
    expect(shouldIgnore("build/output.js", patterns)).toBe(true);
    expect(shouldIgnore(".git/config", patterns)).toBe(true);
  });
});
