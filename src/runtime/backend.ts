// =============================================================================
// Backend Detection — NAPI-only for Node.js
// =============================================================================

export type BackendType = "napi" | "none";

export interface BackendInfo {
  type: BackendType;
  version: string | null;
  module: unknown;
}

let cachedBackend: BackendInfo | undefined;

const NAPI_PACKAGES = [
  "@gauss-ai/core",
  "@giulio-leone/gauss-core-napi",
] as const;

function tryRequire(id: string): unknown | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(id);
  } catch {
    return null;
  }
}

function tryLoadNapi(): BackendInfo | null {
  const envPath = process.env["GAUSS_NAPI_PATH"];
  const paths = [...NAPI_PACKAGES, envPath].filter(Boolean) as string[];

  for (const p of paths) {
    const mod = tryRequire(p);
    if (mod && typeof (mod as Record<string, unknown>).version === "function") {
      return {
        type: "napi",
        version: (mod as { version(): string }).version(),
        module: mod,
      };
    }
  }
  return null;
}

/**
 * Detect available backend. Priority:
 * 1. GAUSS_BACKEND=napi env var (explicit)
 * 2. NAPI auto-detection
 * 3. none (pure TS path)
 */
export function detectBackend(): BackendInfo {
  if (cachedBackend) return cachedBackend;

  const override = process.env["GAUSS_BACKEND"];

  if (override === "napi") {
    const napi = tryLoadNapi();
    if (napi) {
      cachedBackend = napi;
      return napi;
    }
    throw new Error(
      "GAUSS_BACKEND=napi but NAPI module not found. " +
        "Install @gauss-ai/core or set GAUSS_NAPI_PATH."
    );
  }

  const napi = tryLoadNapi();
  if (napi) {
    cachedBackend = napi;
    return napi;
  }

  cachedBackend = { type: "none", version: null, module: null };
  return cachedBackend;
}

/** Check if the NAPI backend is available */
export function hasNativeBackend(): boolean {
  return detectBackend().type === "napi";
}

/** Get the loaded NAPI module (typed) or null */
export function getBackendModule<T = unknown>(): T | null {
  const backend = detectBackend();
  return backend.module as T | null;
}

/** Reset cached backend (for testing) */
export function resetBackendCache(): void {
  cachedBackend = undefined;
}
