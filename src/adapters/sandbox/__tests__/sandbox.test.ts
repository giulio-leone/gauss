// =============================================================================
// Tests: Sandbox Port + LocalShell Adapter
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { LocalShellSandboxAdapter } from "../../../adapters/sandbox/local-shell.adapter.js";

describe("LocalShellSandboxAdapter", () => {
  let sandbox: LocalShellSandboxAdapter;

  beforeEach(() => {
    sandbox = new LocalShellSandboxAdapter({
      blockedPatterns: [/rm\s+-rf\s+\//, /sudo/],
    });
  });

  // -- basic execution --
  it("executes a simple command", async () => {
    const result = await sandbox.execute("echo hello");
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe("hello");
    expect(result.truncated).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures stderr", async () => {
    const result = await sandbox.execute("echo err >&2");
    expect(result.output.trim()).toBe("err");
  });

  it("returns non-zero exit code on failure", async () => {
    const result = await sandbox.execute("exit 42");
    expect(result.exitCode).toBe(42);
  });

  // -- timeout --
  it("kills process on timeout", async () => {
    const result = await sandbox.execute("sleep 60", { timeoutMs: 200 });
    expect(result.exitCode).toBe(124);
    expect(result.output).toContain("[TIMEOUT]");
  });

  // -- output truncation --
  it("truncates output exceeding max bytes", async () => {
    // Generate ~10KB of output but set max to 100 bytes
    const result = await sandbox.execute(
      "yes 'abcdefghij' | head -n 1000",
      { maxOutputBytes: 100 },
    );
    expect(result.truncated).toBe(true);
    // Output includes the truncated content + "[TRUNCATED]" marker
    expect(result.output).toContain("[TRUNCATED]");
  });

  // -- security: blocked patterns --
  it("blocks dangerous commands", async () => {
    const result = await sandbox.execute("rm -rf /");
    expect(result.exitCode).toBe(126);
    expect(result.output).toContain("blocked by security policy");
  });

  it("blocks sudo commands", async () => {
    const result = await sandbox.execute("sudo ls");
    expect(result.exitCode).toBe(126);
  });

  // -- environment variables --
  it("passes env variables", async () => {
    const result = await sandbox.execute("echo $MY_VAR", {
      env: { MY_VAR: "test-value" },
    });
    expect(result.output.trim()).toBe("test-value");
  });

  // -- uploadFiles / downloadFiles --
  it("uploads and downloads files", async () => {
    await sandbox.uploadFiles([
      { path: "/tmp/test.txt", content: "hello world" },
    ]);

    const files = await sandbox.downloadFiles(["/tmp/test.txt"]);
    expect(files).toHaveLength(1);
    expect(files[0].content).toBe("hello world");
  });

  // -- cleanup --
  it("cleanup clears uploaded files", async () => {
    await sandbox.uploadFiles([
      { path: "/tmp/a.txt", content: "a" },
    ]);
    await sandbox.cleanup();

    const files = await sandbox.downloadFiles(["/tmp/a.txt"]);
    expect(files[0].content).toBe("");
  });

  // -- isAvailable --
  it("isAvailable returns true on functional shell", async () => {
    expect(await sandbox.isAvailable()).toBe(true);
  });
});
