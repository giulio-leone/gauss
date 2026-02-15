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

/** Synchronous factory — eagerly imports all adapters (backward compatible). */
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

/** Async factory — lazy-loads only the needed adapter. */
export async function createRuntimeAdapterAsync(name?: RuntimeName): Promise<RuntimePort> {
  const resolved = name ?? detectRuntimeName();
  switch (resolved) {
    case "deno": {
      const { DenoRuntimeAdapter: D } = await import("./deno-runtime.adapter.js");
      return new D();
    }
    case "bun": {
      const { BunRuntimeAdapter: B } = await import("./bun-runtime.adapter.js");
      return new B();
    }
    case "edge": {
      const { EdgeRuntimeAdapter: E } = await import("./edge-runtime.adapter.js");
      return new E();
    }
    case "node":
    case "unknown":
    default: {
      const { NodeRuntimeAdapter: N } = await import("./node-runtime.adapter.js");
      return new N();
    }
  }
}
