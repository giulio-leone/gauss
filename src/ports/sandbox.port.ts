// =============================================================================
// SandboxPort — Isolated execution environments for agent tool use
// =============================================================================

// =============================================================================
// Configuration
// =============================================================================

export interface SandboxConfig {
  /** Execution timeout in ms (default: 30_000) */
  timeoutMs?: number;
  /** Max output size in bytes (default: 1MB) */
  maxOutputBytes?: number;
  /** Working directory inside sandbox */
  workingDir?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Allow network access (default: false) */
  allowNetwork?: boolean;
  /** Memory limit in MB */
  memoryLimitMb?: number;
}

// =============================================================================
// Execution result
// =============================================================================

export interface ExecuteResult {
  /** stdout + stderr combined */
  output: string;
  /** Process exit code */
  exitCode: number;
  /** Whether output was truncated */
  truncated: boolean;
  /** Execution duration in ms */
  durationMs: number;
}

// =============================================================================
// Port interface
// =============================================================================

export interface SandboxPort {
  /** Execute a command in the sandbox */
  execute(command: string, config?: SandboxConfig): Promise<ExecuteResult>;

  /** Upload files into the sandbox */
  uploadFiles(files: Array<{ path: string; content: string | Uint8Array }>): Promise<void>;

  /** Download files from the sandbox */
  downloadFiles(paths: string[]): Promise<Array<{ path: string; content: string }>>;

  /** Clean up sandbox resources */
  cleanup(): Promise<void>;

  /** Check if sandbox is available and healthy */
  isAvailable(): Promise<boolean>;
}
