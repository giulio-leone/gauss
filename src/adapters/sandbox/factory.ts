// =============================================================================
// Sandbox Factory — Auto-select sandbox implementation
// =============================================================================

import type { SandboxPort } from "../../ports/sandbox.port.js";
import { LocalShellSandboxAdapter } from "./local-shell.adapter.js";
import { E2BSandboxAdapter } from "./e2b.adapter.js";
import type { E2BSandboxConfig } from "./e2b.adapter.js";

export interface SandboxFactoryConfig {
  /** Force a specific sandbox type */
  type?: "local" | "e2b" | "auto";
  /** E2B-specific configuration */
  e2b?: E2BSandboxConfig;
}

/**
 * Create a sandbox adapter based on configuration and environment.
 *
 * Selection logic (when type="auto" or omitted):
 * 1. If E2B_API_KEY is set or e2b config has apiKey → E2BSandboxAdapter
 * 2. Otherwise → LocalShellSandboxAdapter
 */
export function createSandbox(config?: SandboxFactoryConfig): SandboxPort {
  const type = config?.type ?? "auto";

  if (type === "e2b") {
    return new E2BSandboxAdapter(config?.e2b);
  }

  if (type === "local") {
    return new LocalShellSandboxAdapter();
  }

  // Auto-detect
  const hasE2bKey = !!(config?.e2b?.apiKey ?? process.env.E2B_API_KEY);
  if (hasE2bKey) {
    return new E2BSandboxAdapter(config?.e2b);
  }

  return new LocalShellSandboxAdapter();
}
