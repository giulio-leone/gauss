import type { RuntimePort } from "../../ports/runtime.port.js";

/**
 * Base implementation of RuntimePort using Web Standard APIs.
 * Subclasses only need to override name and getEnv() for runtime-specific access.
 */
export abstract class BaseRuntimeAdapter implements RuntimePort {
  abstract readonly name: RuntimePort['name'];

  randomUUID(): string {
    return crypto.randomUUID();
  }

  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init);
  }

  abstract getEnv(key: string): string | undefined;

  setTimeout(callback: () => void, ms: number): { clear(): void } {
    const handle = globalThis.setTimeout(callback, ms);
    return { clear: () => globalThis.clearTimeout(handle) };
  }
}
