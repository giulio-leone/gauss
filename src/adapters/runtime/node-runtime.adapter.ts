import type { RuntimePort } from "../../ports/runtime.port.js";

export class NodeRuntimeAdapter implements RuntimePort {
  randomUUID(): string {
    return crypto.randomUUID();
  }

  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init);
  }

  getEnv(key: string): string | undefined {
    return globalThis.process?.env?.[key];
  }

  setTimeout(callback: () => void, ms: number): { clear(): void } {
    const handle = globalThis.setTimeout(callback, ms);
    return { clear: () => globalThis.clearTimeout(handle) };
  }
}
