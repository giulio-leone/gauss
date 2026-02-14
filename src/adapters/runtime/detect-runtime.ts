import type { RuntimePort } from "../../ports/runtime.port.js";
import { NodeRuntimeAdapter } from "./node-runtime.adapter.js";

export type RuntimeName = "node" | "deno" | "bun" | "edge" | "unknown";

export function detectRuntimeName(): RuntimeName {
  if (typeof globalThis !== "undefined") {
    if ("Deno" in globalThis) return "deno";
    if ("Bun" in globalThis) return "bun";
    if (typeof (globalThis as any).process?.versions?.node === "string") return "node";
    // Edge: no process, no Deno, no Bun, but has fetch
    if (typeof globalThis.fetch === "function" && !("process" in globalThis)) return "edge";
  }
  return "unknown";
}

export function createRuntimeAdapter(name?: RuntimeName): RuntimePort {
  const resolved = name ?? detectRuntimeName();
  // For Phase 7, only NodeRuntimeAdapter is available
  // Other adapters will be added in Phase 8
  switch (resolved) {
    case "node":
    case "deno":    // Deno has Node-compatible APIs for these
    case "bun":     // Bun has Node-compatible APIs for these
    case "edge":    // Edge has crypto.randomUUID and fetch
    case "unknown":
    default:
      return new NodeRuntimeAdapter();
  }
}
