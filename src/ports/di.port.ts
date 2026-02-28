// =============================================================================
// DI Port — Dependency Injection contract (Inversion of Control)
// =============================================================================

/**
 * Service lifetime — controls instance reuse.
 */
export enum Lifetime {
  /** One instance shared across all resolutions */
  SINGLETON = "singleton",
  /** New instance per scope (e.g., per request) */
  SCOPED = "scoped",
  /** New instance every resolution */
  TRANSIENT = "transient",
}

/**
 * Token used to identify a service in the container.
 * Can be a string key, a symbol, or a class constructor.
 */
export type Token<T = unknown> = string | symbol | (new (...args: never[]) => T);

/**
 * Factory function that creates a service instance.
 * Receives the container to resolve its own dependencies.
 */
export type Factory<T> = (container: ContainerPort) => T | Promise<T>;

/**
 * Registration descriptor for a service.
 */
export interface Registration<T = unknown> {
  token: Token<T>;
  factory: Factory<T>;
  lifetime: Lifetime;
  tags?: string[];
}

/**
 * ContainerPort — DI container contract.
 *
 * Supports: singleton/scoped/transient lifetimes, child scopes,
 * tagged resolution, async factories, and disposal.
 */
export interface ContainerPort {
  /** Register a service with a factory and lifetime. */
  register<T>(
    token: Token<T>,
    factory: Factory<T>,
    lifetime?: Lifetime,
  ): void;

  /** Register a constant value as a singleton. */
  registerValue<T>(token: Token<T>, value: T): void;

  /** Register a class (auto-resolves constructor deps via metadata). */
  registerClass<T>(
    token: Token<T>,
    ctor: new (...args: never[]) => T,
    lifetime?: Lifetime,
  ): void;

  /** Resolve a service by token. Throws if not registered. */
  resolve<T>(token: Token<T>): T;

  /** Resolve a service asynchronously (for async factories). */
  resolveAsync<T>(token: Token<T>): Promise<T>;

  /** Check if a token is registered. */
  has(token: Token): boolean;

  /** Create a child scope (inherits parent registrations). */
  createScope(): ContainerPort;

  /** Dispose all singletons and scoped instances. */
  dispose(): Promise<void>;

  /** Resolve all services registered with a given tag. */
  resolveTagged<T>(tag: string): T[];
}
