// =============================================================================
// CLI Bash Execution — Run shell commands with timeout and output capture
// =============================================================================

import { execSync } from "node:child_process";

/** Default timeout for shell command execution in ms (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runBash(command: string, timeout = DEFAULT_TIMEOUT_MS): BashResult {
  try {
    const stdout = execSync(command, {
      encoding: "utf-8",
      timeout,
      maxBuffer: 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.status ?? 1,
    };
  }
}
