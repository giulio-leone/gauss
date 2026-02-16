// =============================================================================
// Tests — Git tools
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

// Must import after mock setup
import { execSync, spawnSync } from "node:child_process";
import { createCliTools } from "../tools.js";

const mockExecSync = vi.mocked(execSync);
const mockSpawnSync = vi.mocked(spawnSync);

const toolOpts = { toolCallId: "t1", messages: [], abortSignal: undefined as any };

function makeTools(opts: { yolo?: boolean; confirmResult?: boolean } = {}) {
  return createCliTools({
    yolo: opts.yolo ?? true,
    confirm: vi.fn(async () => opts.confirmResult ?? true),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── gitStatus ──────────────────────────────────────────────────────────

describe("gitStatus", () => {
  it("parses porcelain output correctly", async () => {
    mockExecSync.mockReturnValue("M  src/a.ts\n?? new.txt\n A staged.ts");
    const tools = makeTools();
    const result = await tools.gitStatus.execute({}, toolOpts);
    expect(result).toHaveProperty("staged");
    expect(result).toHaveProperty("unstaged");
    expect(result).toHaveProperty("untracked");
    expect((result as any).untracked).toContain("new.txt");
  });

  it("returns clean tree for empty output", async () => {
    mockExecSync.mockReturnValue("");
    const tools = makeTools();
    const result = await tools.gitStatus.execute({}, toolOpts);
    expect((result as any).summary).toContain("Clean");
  });

  it("returns error for non-git directory", async () => {
    mockExecSync.mockImplementation(() => { throw new Error("not a git repository"); });
    const tools = makeTools();
    const result = await tools.gitStatus.execute({}, toolOpts);
    expect((result as any).error).toContain("not a git repository");
  });
});

// ─── gitDiff ────────────────────────────────────────────────────────────

describe("gitDiff", () => {
  it("calls git diff by default", async () => {
    mockExecSync.mockReturnValue("diff output");
    const tools = makeTools();
    await tools.gitDiff.execute({}, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith("git diff", expect.any(Object));
  });

  it("adds --cached for staged flag", async () => {
    mockExecSync.mockReturnValue("staged diff");
    const tools = makeTools();
    await tools.gitDiff.execute({ staged: true }, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith("git diff --cached", expect.any(Object));
  });

  it("adds file path when provided", async () => {
    mockExecSync.mockReturnValue("file diff");
    const tools = makeTools();
    await tools.gitDiff.execute({ path: "src/a.ts" }, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith("git diff -- src/a.ts", expect.any(Object));
  });

  it("returns error on failure", async () => {
    mockExecSync.mockImplementation(() => { throw new Error("fatal"); });
    const tools = makeTools();
    const result = await tools.gitDiff.execute({}, toolOpts);
    expect((result as any).error).toContain("fatal");
  });
});

// ─── gitCommit ──────────────────────────────────────────────────────────

describe("gitCommit", () => {
  it("stages all and commits with message", async () => {
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === "string" && cmd.includes("diff --cached --stat")) return "1 file changed";
      return "";
    });
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "[main abc123] test commit", stderr: "", pid: 1, output: [], signal: null } as any);
    const tools = makeTools();
    const result = await tools.gitCommit.execute({ message: "test commit" }, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith("git add -A", expect.any(Object));
    expect(mockSpawnSync).toHaveBeenCalledWith("git", ["commit", "-m", "test commit"], expect.any(Object));
    expect((result as any).output).toContain("abc123");
  });

  it("stages specific files when provided", async () => {
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === "string" && cmd.includes("diff --cached --stat")) return "1 file changed";
      return "";
    });
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "committed", stderr: "", pid: 1, output: [], signal: null } as any);
    const tools = makeTools();
    await tools.gitCommit.execute({ message: "msg", files: ["a.ts", "b.ts"] }, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining("git add -- "), expect.any(Object));
  });

  it("respects confirmation gate — cancel resets and returns error", async () => {
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === "string" && cmd.includes("diff --cached --stat")) return "1 file changed";
      return "";
    });
    const tools = makeTools({ yolo: false, confirmResult: false });
    const result = await tools.gitCommit.execute({ message: "msg" }, toolOpts);
    expect((result as any).error).toContain("cancelled");
    // Should have called git reset HEAD
    expect(mockExecSync).toHaveBeenCalledWith("git reset HEAD", expect.any(Object));
  });

  it("returns error when nothing to commit", async () => {
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === "string" && cmd.includes("diff --cached --stat")) return "";
      return "";
    });
    const tools = makeTools();
    const result = await tools.gitCommit.execute({ message: "msg" }, toolOpts);
    expect((result as any).error).toContain("Nothing to commit");
  });
});

// ─── gitLog ─────────────────────────────────────────────────────────────

describe("gitLog", () => {
  it("returns formatted log output", async () => {
    mockExecSync.mockReturnValue("abc123 first\ndef456 second");
    const tools = makeTools();
    const result = await tools.gitLog.execute({ count: 5 }, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith("git log --oneline -5", expect.any(Object));
    expect((result as any).log).toContain("abc123");
  });

  it("defaults to 10 commits", async () => {
    mockExecSync.mockReturnValue("log");
    const tools = makeTools();
    await tools.gitLog.execute({}, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith("git log --oneline -10", expect.any(Object));
  });

  it("returns error on failure", async () => {
    mockExecSync.mockImplementation(() => { throw new Error("not a git repo"); });
    const tools = makeTools();
    const result = await tools.gitLog.execute({}, toolOpts);
    expect((result as any).error).toContain("not a git repo");
  });
});

// ─── gitBranch ──────────────────────────────────────────────────────────

describe("gitBranch", () => {
  it("lists branches", async () => {
    mockExecSync.mockReturnValue("* main\n  dev\n  remotes/origin/main");
    const tools = makeTools();
    const result = await tools.gitBranch.execute({ action: "list" }, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith("git branch -a", expect.any(Object));
    expect((result as any).branches).toContain("main");
  });

  it("creates a branch", async () => {
    mockExecSync.mockReturnValue("");
    const tools = makeTools();
    const result = await tools.gitBranch.execute({ action: "create", name: "feature/x" }, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining("checkout -b"), expect.any(Object));
    expect((result as any).output).toContain("feature/x");
  });

  it("switches branch", async () => {
    mockExecSync.mockReturnValue("");
    const tools = makeTools();
    const result = await tools.gitBranch.execute({ action: "switch", name: "dev" }, toolOpts);
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining("checkout 'dev'"), expect.any(Object));
    expect((result as any).output).toContain("dev");
  });

  it("errors when name missing for create", async () => {
    const tools = makeTools();
    const result = await tools.gitBranch.execute({ action: "create" }, toolOpts);
    expect((result as any).error).toContain("required");
  });

  it("respects confirmation for create", async () => {
    const tools = makeTools({ yolo: false, confirmResult: false });
    const result = await tools.gitBranch.execute({ action: "create", name: "x" }, toolOpts);
    expect((result as any).error).toContain("cancelled");
  });

  it("returns error on failure", async () => {
    mockExecSync.mockImplementation(() => { throw new Error("error: pathspec"); });
    const tools = makeTools();
    const result = await tools.gitBranch.execute({ action: "switch", name: "nonexistent" }, toolOpts);
    expect((result as any).error).toContain("pathspec");
  });
});
