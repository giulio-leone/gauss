// =============================================================================
// DI Container Adapter — Lightweight IoC container implementation
// =============================================================================

import type {
  ContainerPort,
  Token,
  Factory,
  Registration,
} from "../../ports/di.port.js";
import { Lifetime } from "../../ports/di.port.js";

function tokenKey(token: Token): string {
  if (typeof token === "string") return `s:${token}`;
  if (typeof token === "symbol") return `y:${token.toString()}`;
  return `c:${token.name}`;
}

interface InternalRegistration<T = unknown> {
  factory: Factory<T>;
  lifetime: Lifetime;
  tags: string[];
}

export class Container implements ContainerPort {
  private registrations = new Map<string, InternalRegistration>();
  private singletons = new Map<string, unknown>();
  private scoped = new Map<string, unknown>();
  private parent: Container | null;
  private children: Container[] = [];
  private disposed = false;

  constructor(parent?: Container) {
    this.parent = parent ?? null;
  }

  register<T>(
    token: Token<T>,
    factory: Factory<T>,
    lifetime: Lifetime = Lifetime.TRANSIENT,
  ): void {
    this.ensureNotDisposed();
    const key = tokenKey(token);
    this.registrations.set(key, { factory, lifetime, tags: [] });
  }

  registerValue<T>(token: Token<T>, value: T): void {
    this.ensureNotDisposed();
    const key = tokenKey(token);
    this.registrations.set(key, {
      factory: () => value,
      lifetime: Lifetime.SINGLETON,
      tags: [],
    });
    this.singletons.set(key, value);
  }

  registerClass<T>(
    token: Token<T>,
    ctor: new (...args: never[]) => T,
    lifetime: Lifetime = Lifetime.SINGLETON,
  ): void {
    this.register(token, () => new ctor(), lifetime);
  }

  /** Register with tags for tagged resolution. */
  registerTagged<T>(
    token: Token<T>,
    factory: Factory<T>,
    tags: string[],
    lifetime: Lifetime = Lifetime.TRANSIENT,
  ): void {
    this.ensureNotDisposed();
    const key = tokenKey(token);
    this.registrations.set(key, { factory, lifetime, tags });
  }

  resolve<T>(token: Token<T>): T {
    this.ensureNotDisposed();
    const key = tokenKey(token);
    const reg = this.findRegistration(key);
    if (!reg) {
      throw new Error(`DI: No registration for token "${key}"`);
    }
    return this.getInstance(key, reg) as T;
  }

  async resolveAsync<T>(token: Token<T>): Promise<T> {
    this.ensureNotDisposed();
    const key = tokenKey(token);
    const reg = this.findRegistration(key);
    if (!reg) {
      throw new Error(`DI: No registration for token "${key}"`);
    }
    return this.getInstanceAsync(key, reg) as Promise<T>;
  }

  has(token: Token): boolean {
    const key = tokenKey(token);
    return this.findRegistration(key) !== undefined;
  }

  createScope(): ContainerPort {
    this.ensureNotDisposed();
    const child = new Container(this);
    this.children.push(child);
    return child;
  }

  async dispose(): Promise<void> {
    // Dispose children first
    for (const child of this.children) {
      await child.dispose();
    }
    // Call dispose() on disposable instances
    for (const instance of this.singletons.values()) {
      if (instance && typeof (instance as { dispose?: () => unknown }).dispose === "function") {
        await (instance as { dispose: () => unknown }).dispose();
      }
    }
    for (const instance of this.scoped.values()) {
      if (instance && typeof (instance as { dispose?: () => unknown }).dispose === "function") {
        await (instance as { dispose: () => unknown }).dispose();
      }
    }
    this.singletons.clear();
    this.scoped.clear();
    this.registrations.clear();
    this.children = [];
    this.disposed = true;
  }

  resolveTagged<T>(tag: string): T[] {
    this.ensureNotDisposed();
    const results: T[] = [];
    for (const [key, reg] of this.allRegistrations()) {
      if (reg.tags.includes(tag)) {
        results.push(this.getInstance(key, reg) as T);
      }
    }
    return results;
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private findRegistration(key: string): InternalRegistration | undefined {
    return this.registrations.get(key) ?? this.parent?.findRegistration(key);
  }

  private *allRegistrations(): Generator<[string, InternalRegistration]> {
    // Yield parent's first (child overrides)
    if (this.parent) yield* this.parent.allRegistrations();
    yield* this.registrations;
  }

  private getInstance(key: string, reg: InternalRegistration): unknown {
    switch (reg.lifetime) {
      case Lifetime.SINGLETON: {
        if (this.singletons.has(key)) return this.singletons.get(key);
        // Singletons live at root
        if (this.parent?.singletons.has(key)) return this.parent.singletons.get(key);
        const instance = reg.factory(this);
        const root = this.getRoot();
        root.singletons.set(key, instance);
        return instance;
      }
      case Lifetime.SCOPED: {
        if (this.scoped.has(key)) return this.scoped.get(key);
        const instance = reg.factory(this);
        this.scoped.set(key, instance);
        return instance;
      }
      case Lifetime.TRANSIENT:
        return reg.factory(this);
    }
  }

  private async getInstanceAsync(key: string, reg: InternalRegistration): Promise<unknown> {
    switch (reg.lifetime) {
      case Lifetime.SINGLETON: {
        if (this.singletons.has(key)) return this.singletons.get(key);
        if (this.parent?.singletons.has(key)) return this.parent.singletons.get(key);
        const instance = await reg.factory(this);
        const root = this.getRoot();
        root.singletons.set(key, instance);
        return instance;
      }
      case Lifetime.SCOPED: {
        if (this.scoped.has(key)) return this.scoped.get(key);
        const instance = await reg.factory(this);
        this.scoped.set(key, instance);
        return instance;
      }
      case Lifetime.TRANSIENT:
        return reg.factory(this);
    }
  }

  private getRoot(): Container {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let c: Container = this;
    while (c.parent) c = c.parent;
    return c;
  }

  private ensureNotDisposed(): void {
    if (this.disposed) throw new Error("DI: Container has been disposed");
  }
}
