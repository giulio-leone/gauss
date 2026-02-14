import type { RuntimePort } from "../../ports/runtime.port.js";
import { NodeRuntimeAdapter } from "./node-runtime.adapter.js";
import { DenoRuntimeAdapter } from "./deno-runtime.adapter.js";
import { BunRuntimeAdapter } from "./bun-runtime.adapter.js";
import { EdgeRuntimeAdapter } from "./edge-runtime.adapter.js";

export type RuntimeName = "node" | "deno" | "bun" | "edge" | "unknown";

export function detectRuntimeName(): RuntimeName {
  if (typeof globalThis !== "undefined") {
    if ("Deno" in globalThis) return "deno";
    if ("Bun" in globalThis) return "bun";
    if (typeof (globalThis as any).process?.versions?.node === "string") return "node";
    if (typeof globalThis.fetch === "function" && !("process" in globalThis)) return "edge";
  }
  return "unknown";
}

export function createRuntimeAdapter(name?: RuntimeName): RuntimePort {
  const resolved = name ?? detectRuntimeName();
  switch (resolved) {
    case "deno":
      return new DenoRuntimeAdapter();
    case "bun":
      return new BunRuntimeAdapter();
    case "edge":
      return new EdgeRuntimeAdapter();
    case "node":
    case "unknown":
    default:
      return new NodeRuntimeAdapter();
  }
}
