import { BaseRuntimeAdapter } from "./base-runtime.adapter.js";

export class BunRuntimeAdapter extends BaseRuntimeAdapter {
  readonly name = 'bun' as const;

  getEnv(key: string): string | undefined {
    return globalThis.process?.env?.[key];
  }
}
