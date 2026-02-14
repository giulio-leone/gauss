import type { RuntimePort } from "../../ports/runtime.port.js";

export class EdgeRuntimeAdapter implements RuntimePort {
  randomUUID(): string {
    return crypto.randomUUID();
  }

  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init);
  }

  getEnv(_key: string): string | undefined {
    // Edge runtimes (Cloudflare Workers, Vercel Edge) bind env vars
    // via the request context, not a global. Return undefined by default;
    // users should subclass or provide env via config.
    return undefined;
  }

  setTimeout(callback: () => void, ms: number): { clear(): void } {
    const handle = globalThis.setTimeout(callback, ms);
    return { clear: () => globalThis.clearTimeout(handle) };
  }
}
