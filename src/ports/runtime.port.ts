// RuntimePort — Platform-agnostic runtime contract

export interface RuntimePort {
  /** Human-readable runtime identifier */
  readonly name: 'node' | 'deno' | 'bun' | 'edge' | 'unknown';

  /** Generate a unique identifier */
  randomUUID(): string;

  /** HTTP fetch (standard Fetch API) */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;

  /** Read an environment variable */
  getEnv(key: string): string | undefined;

  /** Schedule a delayed callback. Returns a disposable handle. */
  setTimeout(callback: () => void, ms: number): { clear(): void };
}
