import { describe, it, expect } from "vitest";
import { Container } from "../container.js";
import { Lifetime } from "../../../ports/di.port.js";

describe("DI Container", () => {
  it("registers and resolves a transient service", () => {
    const c = new Container();
    let calls = 0;
    c.register("svc", () => ({ id: ++calls }), Lifetime.TRANSIENT);
    const a = c.resolve<{ id: number }>("svc");
    const b = c.resolve<{ id: number }>("svc");
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
  });

  it("registers and resolves a singleton", () => {
    const c = new Container();
    let calls = 0;
    c.register("svc", () => ({ id: ++calls }), Lifetime.SINGLETON);
    const a = c.resolve<{ id: number }>("svc");
    const b = c.resolve<{ id: number }>("svc");
    expect(a).toBe(b);
    expect(a.id).toBe(1);
  });

  it("registerValue stores a constant singleton", () => {
    const c = new Container();
    const val = { key: "test" };
    c.registerValue("cfg", val);
    expect(c.resolve("cfg")).toBe(val);
  });

  it("registerClass auto-constructs", () => {
    class MyService {
      readonly x = 42;
    }
    const c = new Container();
    c.registerClass("svc", MyService);
    expect(c.resolve<MyService>("svc").x).toBe(42);
  });

  it("has() checks registration", () => {
    const c = new Container();
    expect(c.has("missing")).toBe(false);
    c.register("present", () => 1);
    expect(c.has("present")).toBe(true);
  });

  it("throws on unregistered token", () => {
    const c = new Container();
    expect(() => c.resolve("missing")).toThrow("No registration");
  });

  it("child scope inherits parent registrations", () => {
    const c = new Container();
    c.registerValue("config", { port: 3000 });
    const child = c.createScope();
    expect(child.resolve("config")).toEqual({ port: 3000 });
  });

  it("child scope can override parent", () => {
    const c = new Container();
    c.registerValue("val", "parent");
    const child = c.createScope() as Container;
    child.registerValue("val", "child");
    expect(child.resolve("val")).toBe("child");
    expect(c.resolve("val")).toBe("parent");
  });

  it("scoped lifetime creates per-scope instances", () => {
    const c = new Container();
    let id = 0;
    c.register("svc", () => ({ id: ++id }), Lifetime.SCOPED);
    const scope1 = c.createScope();
    const scope2 = c.createScope();
    const a = scope1.resolve<{ id: number }>("svc");
    const b = scope1.resolve<{ id: number }>("svc");
    const c2 = scope2.resolve<{ id: number }>("svc");
    expect(a).toBe(b); // same scope, same instance
    expect(a.id).not.toBe(c2.id); // different scope, different instance
  });

  it("dispose calls dispose on instances", async () => {
    const c = new Container();
    let disposed = false;
    c.register("svc", () => ({
      dispose: () => { disposed = true; },
    }), Lifetime.SINGLETON);
    c.resolve("svc");
    await c.dispose();
    expect(disposed).toBe(true);
  });

  it("throws after dispose", async () => {
    const c = new Container();
    await c.dispose();
    expect(() => c.resolve("x")).toThrow("disposed");
  });

  it("resolveAsync works with async factories", async () => {
    const c = new Container();
    c.register("async-svc", async () => {
      return { data: "hello" };
    }, Lifetime.SINGLETON);
    const result = await c.resolveAsync<{ data: string }>("async-svc");
    expect(result.data).toBe("hello");
  });

  it("resolveTagged returns services by tag", () => {
    const c = new Container();
    (c as Container).registerTagged("a", () => "serviceA", ["http"], Lifetime.TRANSIENT);
    (c as Container).registerTagged("b", () => "serviceB", ["http", "rpc"], Lifetime.TRANSIENT);
    (c as Container).registerTagged("c", () => "serviceC", ["rpc"], Lifetime.TRANSIENT);
    const httpServices = c.resolveTagged<string>("http");
    expect(httpServices).toHaveLength(2);
    expect(httpServices).toContain("serviceA");
    expect(httpServices).toContain("serviceB");
  });

  it("symbol tokens work", () => {
    const c = new Container();
    const TOKEN = Symbol("myService");
    c.registerValue(TOKEN, { v: 1 });
    expect(c.resolve<{ v: number }>(TOKEN).v).toBe(1);
  });
});
