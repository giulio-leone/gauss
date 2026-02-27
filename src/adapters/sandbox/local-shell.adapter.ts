// =============================================================================
// LocalShellSandboxAdapter — Subprocess-based sandbox with timeout/truncation
// =============================================================================

import { spawn } from "node:child_process";
import type { SandboxPort, SandboxConfig, ExecuteResult } from "../../ports/sandbox.port.js";

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_OUTPUT = 1024 * 1024; // 1MB

export interface LocalShellOptions {
  /** Default working directory */
  cwd?: string;
  /** Shell binary (default: /bin/sh) */
  shell?: string;
  /** Blocked commands (regex patterns) */
  blockedPatterns?: RegExp[];
  /** Inherit parent process env (default: false for security) */
  inheritParentEnv?: boolean;
}

export class LocalShellSandboxAdapter implements SandboxPort {
  private readonly opts: LocalShellOptions;
  private readonly uploadedFiles = new Map<string, string | Uint8Array>();

  constructor(options?: LocalShellOptions) {
    this.opts = options ?? {};
  }

  async execute(command: string, config?: SandboxConfig): Promise<ExecuteResult> {
    // Security: check blocked patterns
    if (this.opts.blockedPatterns) {
      for (const pattern of this.opts.blockedPatterns) {
        if (pattern.test(command)) {
          return {
            output: `Command blocked by security policy: ${pattern.source}`,
            exitCode: 126,
            truncated: false,
            durationMs: 0,
          };
        }
      }
    }

    const timeout = config?.timeoutMs ?? DEFAULT_TIMEOUT;
    const maxOutput = config?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    const cwd = config?.workingDir ?? this.opts.cwd ?? process.cwd();
    const shell = this.opts.shell ?? "/bin/sh";

    const env = {
      ...(this.opts.inheritParentEnv ? process.env : { PATH: process.env.PATH }),
      ...config?.env,
    };

    const start = Date.now();

    return new Promise<ExecuteResult>((resolve) => {
      const child = spawn(shell, ["-c", command], { cwd, env });

      let output = "";
      let truncated = false;
      let settled = false;

      const onData = (chunk: Buffer) => {
        if (truncated || settled) return;
        const text = chunk.toString();
        if (output.length + text.length > maxOutput) {
          output += text.slice(0, maxOutput - output.length);
          truncated = true;
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          resolve({
            output: output + "\n[TRUNCATED]",
            exitCode: 0,
            truncated: true,
            durationMs: Date.now() - start,
          });
        } else {
          output += text;
        }
      };

      child.stdout.on("data", onData);
      child.stderr.on("data", onData);

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill("SIGKILL");
          resolve({
            output: output + "\n[TIMEOUT]",
            exitCode: 124,
            truncated,
            durationMs: Date.now() - start,
          });
        }
      }, timeout);

      child.on("close", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            output,
            exitCode: code ?? 1,
            truncated,
            durationMs: Date.now() - start,
          });
        }
      });

      child.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            output: err.message,
            exitCode: 127,
            truncated: false,
            durationMs: Date.now() - start,
          });
        }
      });
    });
  }

  async uploadFiles(files: Array<{ path: string; content: string | Uint8Array }>): Promise<void> {
    for (const f of files) {
      this.uploadedFiles.set(f.path, f.content);
    }
  }

  async downloadFiles(paths: string[]): Promise<Array<{ path: string; content: string }>> {
    return paths.map((p) => {
      const content = this.uploadedFiles.get(p);
      return { path: p, content: content ? String(content) : "" };
    });
  }

  async cleanup(): Promise<void> {
    this.uploadedFiles.clear();
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.execute("echo ok", { timeoutMs: 5000 });
      return result.exitCode === 0 && result.output.trim() === "ok";
    } catch {
      return false;
    }
  }
}
