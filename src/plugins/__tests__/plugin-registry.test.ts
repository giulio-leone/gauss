// =============================================================================
// Plugin Registry — Tests
// =============================================================================

import { describe, expect, it } from "vitest";

import { DefaultPluginRegistryAdapter } from "../../adapters/plugin-registry/default-plugin-registry.adapter.js";
import { PluginRegistryPlugin } from "../plugin-registry.plugin.js";
import type { PluginManifest } from "../../ports/plugin-registry.port.js";
import type { DeepAgentPlugin } from "../../ports/plugin.port.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBuiltinManifest(
  name: string,
  overrides: Partial<PluginManifest> = {},
): PluginManifest {
  const plugin: DeepAgentPlugin = {
    name,
    version: "1.0.0",
  };
  return {
    name,
    version: "1.0.0",
    description: `Test plugin ${name}`,
    source: { type: "builtin", factory: () => plugin },
    ...overrides,
  };
}

// ─── DefaultPluginRegistryAdapter ─────────────────────────────────────────────

describe("DefaultPluginRegistryAdapter", () => {
  // ── register / get ──────────────────────────────────────────────────────────

  it("registers and retrieves a plugin manifest", () => {
    const registry = new DefaultPluginRegistryAdapter();
    const manifest = makeBuiltinManifest("my-plugin");

    registry.register(manifest);

    expect(registry.get("my-plugin")).toBe(manifest);
  });

  it("throws on duplicate registration", () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(makeBuiltinManifest("dup"));

    expect(() => registry.register(makeBuiltinManifest("dup"))).toThrow(
      /already registered/,
    );
  });

  it("validates manifest has required fields", () => {
    const registry = new DefaultPluginRegistryAdapter();

    expect(() =>
      registry.register({ name: "", version: "1.0.0", description: "x", source: { type: "builtin", factory: () => ({ name: "x" }) } }),
    ).toThrow(/name/);

    expect(() =>
      registry.register({ name: "x", version: "", description: "x", source: { type: "builtin", factory: () => ({ name: "x" }) } }),
    ).toThrow(/version/);

    expect(() =>
      registry.register({ name: "x", version: "1.0.0", description: "", source: { type: "builtin", factory: () => ({ name: "x" }) } }),
    ).toThrow(/description/);
  });

  // ── unregister ──────────────────────────────────────────────────────────────

  it("unregisters a plugin", () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(makeBuiltinManifest("temp"));

    registry.unregister("temp");

    expect(registry.get("temp")).toBeUndefined();
  });

  it("throws when unregistering a non-existent plugin", () => {
    const registry = new DefaultPluginRegistryAdapter();
    expect(() => registry.unregister("ghost")).toThrow(/not registered/);
  });

  // ── list ────────────────────────────────────────────────────────────────────

  it("lists all registered manifests", () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(makeBuiltinManifest("a"));
    registry.register(makeBuiltinManifest("b"));
    registry.register(makeBuiltinManifest("c"));

    const names = registry.list().map((m) => m.name);
    expect(names).toEqual(["a", "b", "c"]);
  });

  it("returns empty array when nothing registered", () => {
    expect(new DefaultPluginRegistryAdapter().list()).toEqual([]);
  });

  // ── search ──────────────────────────────────────────────────────────────────

  it("searches by name", () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(makeBuiltinManifest("image-gen"));
    registry.register(makeBuiltinManifest("text-gen"));

    const results = registry.search("image");
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("image-gen");
  });

  it("searches by description", () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(
      makeBuiltinManifest("foo", { description: "Processes CSV files" }),
    );
    registry.register(makeBuiltinManifest("bar", { description: "Math tools" }));

    expect(registry.search("csv")).toHaveLength(1);
  });

  it("searches by tags", () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(makeBuiltinManifest("x", { tags: ["ai", "ml"] }));
    registry.register(makeBuiltinManifest("y", { tags: ["database"] }));

    expect(registry.search("ml")).toHaveLength(1);
    expect(registry.search("ml")[0]!.name).toBe("x");
  });

  it("search is case-insensitive", () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(makeBuiltinManifest("MyPlugin"));
    expect(registry.search("myplugin")).toHaveLength(1);
  });

  it("returns empty array for no-match search", () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(makeBuiltinManifest("x"));
    expect(registry.search("zzz")).toEqual([]);
  });

  // ── resolve builtin ─────────────────────────────────────────────────────────

  it("resolves builtin plugins via factory", async () => {
    const registry = new DefaultPluginRegistryAdapter();
    const expectedPlugin: DeepAgentPlugin = { name: "hello", version: "2.0.0" };

    registry.register({
      name: "hello",
      version: "2.0.0",
      description: "Greeting plugin",
      source: { type: "builtin", factory: () => expectedPlugin },
    });

    const plugin = await registry.resolve("hello");
    expect(plugin).toBe(expectedPlugin);
  });

  // ── resolve module ──────────────────────────────────────────────────────────

  it("resolves module plugins via dynamic import", async () => {
    const registry = new DefaultPluginRegistryAdapter();

    // Use the test helper module via file URL
    const helperPath = new URL(
      "./__fixtures__/test-plugin-module.js",
      import.meta.url,
    ).href;

    registry.register({
      name: "mod-plugin",
      version: "1.0.0",
      description: "Module-loaded plugin",
      source: { type: "module", modulePath: helperPath, exportName: "TestPlugin" },
    });

    const plugin = await registry.resolve("mod-plugin");
    expect(plugin.name).toBe("test-fixture-plugin");
  });

  // ── resolve url (rejected) ─────────────────────────────────────────────────

  it("rejects URL source type for security", async () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register({
      name: "remote",
      version: "1.0.0",
      description: "Remote plugin",
      source: { type: "url", url: "https://evil.com/plugin.js" },
    });

    await expect(registry.resolve("remote")).rejects.toThrow(
      /not supported for security/,
    );
  });

  // ── resolve non-existent ────────────────────────────────────────────────────

  it("throws when resolving unregistered plugin", async () => {
    const registry = new DefaultPluginRegistryAdapter();
    await expect(registry.resolve("nope")).rejects.toThrow(/not registered/);
  });

  // ── dependency validation ───────────────────────────────────────────────────

  it("rejects resolve when dependencies are missing", async () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(
      makeBuiltinManifest("child", { dependencies: ["parent"] }),
    );

    await expect(registry.resolve("child")).rejects.toThrow(
      /unresolved dependencies.*parent/,
    );
  });

  it("resolves when all dependencies are registered", async () => {
    const registry = new DefaultPluginRegistryAdapter();
    registry.register(makeBuiltinManifest("dep-a"));
    registry.register(
      makeBuiltinManifest("dep-b", { dependencies: ["dep-a"] }),
    );

    const plugin = await registry.resolve("dep-b");
    expect(plugin.name).toBe("dep-b");
  });
});

// ─── PluginRegistryPlugin (tools) ─────────────────────────────────────────────

describe("PluginRegistryPlugin", () => {
  function createPluginWithRegistry() {
    const registry = new DefaultPluginRegistryAdapter();
    const plugin = new PluginRegistryPlugin({ registry });
    return { registry, plugin };
  }

  it("has all expected tools", () => {
    const { plugin } = createPluginWithRegistry();
    expect(Object.keys(plugin.tools)).toEqual([
      "registry:list",
      "registry:search",
      "registry:info",
      "registry:install",
    ]);
  });

  it("registry:list returns registered plugins", async () => {
    const { registry, plugin } = createPluginWithRegistry();
    registry.register(makeBuiltinManifest("alpha", { tags: ["ai"] }));
    registry.register(makeBuiltinManifest("beta"));

    const result = await (plugin.tools["registry:list"] as any).execute({});
    expect(result.count).toBe(2);
    expect(result.plugins[0].name).toBe("alpha");
  });

  it("registry:search filters by query", async () => {
    const { registry, plugin } = createPluginWithRegistry();
    registry.register(makeBuiltinManifest("search-hit", { tags: ["cool"] }));
    registry.register(makeBuiltinManifest("other"));

    const result = await (plugin.tools["registry:search"] as any).execute({
      query: "cool",
    });
    expect(result.count).toBe(1);
    expect(result.plugins[0].name).toBe("search-hit");
  });

  it("registry:info returns manifest details", async () => {
    const { registry, plugin } = createPluginWithRegistry();
    registry.register(
      makeBuiltinManifest("info-test", {
        author: "Test Author",
        tags: ["tag1"],
      }),
    );

    const result = await (plugin.tools["registry:info"] as any).execute({
      name: "info-test",
    });
    expect(result.name).toBe("info-test");
    expect(result.author).toBe("Test Author");
    expect(result.sourceType).toBe("builtin");
  });

  it("registry:info returns error for unknown plugin", async () => {
    const { plugin } = createPluginWithRegistry();
    const result = await (plugin.tools["registry:info"] as any).execute({
      name: "nope",
    });
    expect(result.error).toMatch(/not found/);
  });

  it("exposes registry via getRegistry()", () => {
    const { registry, plugin } = createPluginWithRegistry();
    expect(plugin.getRegistry()).toBe(registry);
  });

  it("creates default registry when none provided", () => {
    const plugin = new PluginRegistryPlugin();
    expect(plugin.getRegistry()).toBeInstanceOf(DefaultPluginRegistryAdapter);
  });

  it("has correct name and version", () => {
    const plugin = new PluginRegistryPlugin();
    expect(plugin.name).toBe("plugin-registry");
    expect(plugin.version).toBe("1.0.0");
  });
});
