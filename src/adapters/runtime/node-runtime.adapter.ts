import { BaseRuntimeAdapter } from "./base-runtime.adapter.js";

export class NodeRuntimeAdapter extends BaseRuntimeAdapter {
  readonly name = 'node' as const;

  getEnv(key: string): string | undefined {
    return globalThis.process?.env?.[key];
  }
}
