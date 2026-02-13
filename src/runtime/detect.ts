// =============================================================================
// Runtime Detection — Lazy capability detection for multi-runtime support
// =============================================================================

export type RuntimeId = "node" | "deno" | "bun" | "cloudflare-workers" | "browser" | "unknown";

export interface RuntimeCapabilities {
  runtime: RuntimeId;
  hasNativeFs: boolean;
  hasIndexedDB: boolean;
  hasOPFS: boolean;
  hasDenoKv: boolean;
  hasFetch: boolean;
  hasWebCrypto: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

let cachedRuntime: RuntimeId | undefined;
let cachedCapabilities: RuntimeCapabilities | undefined;

/** Detect the current runtime environment (result is cached after first call) */
export function detectRuntime(): RuntimeId {
  if (cachedRuntime !== undefined) return cachedRuntime;

  if (typeof g.Deno !== "undefined") cachedRuntime = "deno";
  else if (typeof g.Bun !== "undefined") cachedRuntime = "bun";
  else if (typeof g.caches !== "undefined" && typeof g.process === "undefined" && typeof g.window === "undefined") cachedRuntime = "cloudflare-workers";
  else if (typeof g.process !== "undefined" && typeof g.process.versions?.node === "string") cachedRuntime = "node";
  else if (typeof g.window !== "undefined" && typeof g.document !== "undefined") cachedRuntime = "browser";
  else cachedRuntime = "unknown";

  return cachedRuntime;
}

/** Detect available capabilities (result is cached after first call) */
export function detectCapabilities(): RuntimeCapabilities {
  if (cachedCapabilities !== undefined) return cachedCapabilities;

  const runtime = detectRuntime();
  cachedCapabilities = {
    runtime,
    hasNativeFs: runtime === "node" || runtime === "bun" || runtime === "deno",
    hasIndexedDB: typeof g.indexedDB !== "undefined",
    hasOPFS: typeof g.navigator?.storage?.getDirectory === "function",
    hasDenoKv: runtime === "deno" && typeof g.Deno?.openKv === "function",
    hasFetch: typeof globalThis.fetch === "function",
    hasWebCrypto: typeof globalThis.crypto?.randomUUID === "function",
  };

  return cachedCapabilities;
}
