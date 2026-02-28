import type { RuntimePort } from "../../ports/runtime.port.js";
import { NodeRuntimeAdapter } from "./node-runtime.adapter.js";

export type RuntimeName = "node";

export function detectRuntimeName(): RuntimeName {
  return "node";
}

export function createRuntimeAdapter(): RuntimePort {
  return new NodeRuntimeAdapter();
}

export async function createRuntimeAdapterAsync(): Promise<RuntimePort> {
  const { NodeRuntimeAdapter: N } = await import("./node-runtime.adapter.js");
  return new N();
}
