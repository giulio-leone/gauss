import { BaseRuntimeAdapter } from "./base-runtime.adapter.js";

export class DenoRuntimeAdapter extends BaseRuntimeAdapter {
  readonly name = 'deno' as const;

  getEnv(key: string): string | undefined {
    return (globalThis as any).Deno?.env?.get(key);
  }
}
