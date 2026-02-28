// =============================================================================
// Runtime Detection — Node.js only
// =============================================================================

export type RuntimeId = "node";

export interface RuntimeCapabilities {
  runtime: RuntimeId;
  hasNativeFs: boolean;
  hasFetch: boolean;
  hasWebCrypto: boolean;
}

const capabilities: RuntimeCapabilities = {
  runtime: "node",
  hasNativeFs: true,
  hasFetch: typeof globalThis.fetch === "function",
  hasWebCrypto: typeof globalThis.crypto?.randomUUID === "function",
};

export function detectRuntime(): RuntimeId {
  return "node";
}

export function detectCapabilities(): RuntimeCapabilities {
  return capabilities;
}
