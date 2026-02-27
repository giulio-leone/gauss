// =============================================================================
// E2BSandboxAdapter — Cloud sandbox using E2B Code Interpreter SDK
// =============================================================================
// Requires: @e2b/code-interpreter as peer dependency
// Install: npm install @e2b/code-interpreter
// Set E2B_API_KEY environment variable
// =============================================================================

import type { SandboxPort, SandboxConfig, ExecuteResult } from "../../ports/sandbox.port.js";

export interface E2BSandboxConfig {
  /** E2B API key (defaults to E2B_API_KEY env var) */
  apiKey?: string;
  /** E2B sandbox template (default: "base") */
  template?: string;
  /** Sandbox timeout in ms (default: 300_000 = 5 min) */
  sandboxTimeoutMs?: number;
}

/**
 * E2B Cloud Sandbox adapter.
 * Dynamically imports @e2b/code-interpreter to avoid hard dependency.
 */
export class E2BSandboxAdapter implements SandboxPort {
  private config: E2BSandboxConfig;
  private sandbox: unknown | null = null;
  private sandboxModule: unknown | null = null;

  constructor(config?: E2BSandboxConfig) {
    this.config = {
      apiKey: config?.apiKey,
      template: config?.template ?? "base",
      sandboxTimeoutMs: config?.sandboxTimeoutMs ?? 300_000,
    };
  }

  private async getSandboxModule(): Promise<{ Sandbox: any }> {
    if (this.sandboxModule) return this.sandboxModule as { Sandbox: any };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const moduleName = "@e2b/code-interpreter";
      this.sandboxModule = await import(/* @vite-ignore */ moduleName);
      return this.sandboxModule as { Sandbox: any };
    } catch {
      throw new Error(
        "E2B SDK not installed. Run: npm install @e2b/code-interpreter\n" +
        "Also set E2B_API_KEY environment variable.",
      );
    }
  }

  private async ensureSandbox(): Promise<any> {
    if (this.sandbox) return this.sandbox;
    const mod = await this.getSandboxModule();
    const SandboxClass = mod.Sandbox ?? (mod as any).default?.Sandbox ?? (mod as any).CodeInterpreter;
    if (!SandboxClass) {
      throw new Error("Could not find Sandbox class in @e2b/code-interpreter module");
    }
    this.sandbox = await SandboxClass.create({
      apiKey: this.config.apiKey ?? process.env.E2B_API_KEY,
      template: this.config.template,
      timeout: this.config.sandboxTimeoutMs,
    });
    return this.sandbox;
  }

  async execute(command: string, config?: SandboxConfig): Promise<ExecuteResult> {
    const timeoutMs = config?.timeoutMs ?? 30_000;
    const maxOutputBytes = config?.maxOutputBytes ?? 1_048_576;
    const startTime = Date.now();

    let sandbox: any;
    try {
      sandbox = await this.ensureSandbox();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: `E2B execution error: ${message}`, exitCode: 1, truncated: false, durationMs: Date.now() - startTime };
    }

    try {
      if (config?.env) {
        for (const [key, value] of Object.entries(config.env)) {
          await sandbox.process?.setEnv?.(key, value);
        }
      }

      const cwd = config?.workingDir ?? "/home/user";
      const proc = await sandbox.process.start({ cmd: command, cwd, timeout: timeoutMs });
      await proc.wait();
      const durationMs = Date.now() - startTime;

      let output = (proc.output?.stdout ?? "") + (proc.output?.stderr ?? "");
      let truncated = false;
      if (output.length > maxOutputBytes) {
        output = output.slice(0, maxOutputBytes);
        truncated = true;
      }

      return { output, exitCode: proc.output?.exitCode ?? proc.exitCode ?? 1, truncated, durationMs };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: `E2B execution error: ${message}`, exitCode: 1, truncated: false, durationMs: Date.now() - startTime };
    }
  }

  async uploadFiles(files: Array<{ path: string; content: string | Uint8Array }>): Promise<void> {
    const sandbox = await this.ensureSandbox() as any;
    for (const file of files) {
      const content = typeof file.content === "string"
        ? new TextEncoder().encode(file.content)
        : file.content;
      await sandbox.files.write(file.path, content);
    }
  }

  async downloadFiles(paths: string[]): Promise<Array<{ path: string; content: string }>> {
    const sandbox = await this.ensureSandbox() as any;
    const results: Array<{ path: string; content: string }> = [];
    for (const path of paths) {
      const content = await sandbox.files.read(path);
      results.push({
        path,
        content: typeof content === "string" ? content : new TextDecoder().decode(content),
      });
    }
    return results;
  }

  async cleanup(): Promise<void> {
    if (this.sandbox) {
      try {
        await (this.sandbox as any).close?.();
        await (this.sandbox as any).kill?.();
      } catch {
        // Best-effort cleanup
      }
      this.sandbox = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.getSandboxModule();
      const apiKey = this.config.apiKey ?? process.env.E2B_API_KEY;
      return !!apiKey;
    } catch {
      return false;
    }
  }
}
