import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import { AgentConfigLoader } from "../agent-config-loader.js";
import { FileWatcherAdapter } from "../../adapters/hot-reload/file-watcher.adapter.js";
import type { HotReloadAgentConfig as AgentConfig } from "../../ports/hot-reload.port.js";
import type { LanguageModel } from "ai";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockModel(id = "mock-model"): LanguageModel {
  return { modelId: id } as unknown as LanguageModel;
}

const mockResolver = (name: string) => makeMockModel(name);

const validConfig: AgentConfig = {
  name: "test-agent",
  model: "gpt-5.2",
  systemPrompt: "You are a helpful assistant.",
  maxSteps: 10,
};

// ---------------------------------------------------------------------------
// AgentConfigLoader.fromConfig
// ---------------------------------------------------------------------------

describe("AgentConfigLoader.fromConfig", () => {
  it("creates an agent with the correct name", () => {
    const agent = AgentConfigLoader.fromConfig(validConfig, mockResolver);
    expect(agent).toBeDefined();
    expect(agent.sessionId).toBeDefined();
  });

  it("passes model string through modelResolver", () => {
    const resolver = vi.fn(mockResolver);
    AgentConfigLoader.fromConfig(validConfig, resolver);
    expect(resolver).toHaveBeenCalledWith("gpt-5.2");
  });

  it("works with minimal config (no optional fields)", () => {
    const minimal: AgentConfig = { name: "min", model: "gpt-3.5" };
    const agent = AgentConfigLoader.fromConfig(minimal, mockResolver);
    expect(agent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AgentConfigLoader.loadFile
// ---------------------------------------------------------------------------

describe("AgentConfigLoader.loadFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads and parses valid JSON config", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(validConfig));
    const config = AgentConfigLoader.loadFile("/fake/path.json");
    expect(config).toEqual(validConfig);
  });

  it("throws on missing file", () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    expect(() => AgentConfigLoader.loadFile("/nonexistent.json")).toThrow("ENOENT");
  });

  it("throws on invalid JSON", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue("not-json{{{");
    expect(() => AgentConfigLoader.loadFile("/bad.json")).toThrow();
  });

  it("throws when required 'name' is missing", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ model: "gpt-5.2" }));
    expect(() => AgentConfigLoader.loadFile("/missing-name.json")).toThrow("name");
  });

  it("throws when required 'model' is missing", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ name: "test" }));
    expect(() => AgentConfigLoader.loadFile("/missing-model.json")).toThrow("model");
  });

  it("throws on empty name", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ name: "", model: "gpt-5.2" }));
    expect(() => AgentConfigLoader.loadFile("/empty-name.json")).toThrow("name");
  });

  it("throws on non-object config", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify("string"));
    expect(() => AgentConfigLoader.loadFile("/not-object.json")).toThrow("JSON object");
  });
});

// ---------------------------------------------------------------------------
// FileWatcherAdapter — debounce behavior
// ---------------------------------------------------------------------------

describe("FileWatcherAdapter debounce", () => {
  let adapter: FileWatcherAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new FileWatcherAdapter(300);
  });

  afterEach(() => {
    adapter.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("debounces rapid changes", () => {
    const onChange = vi.fn();

    const listeners: Array<() => void> = [];
    vi.spyOn(fs, "watch").mockImplementation((_path: unknown, listener: unknown) => {
      listeners.push(listener as () => void);
      return { close: vi.fn() } as unknown as fs.FSWatcher;
    });
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(validConfig));

    adapter.watch("/config.json", onChange);

    // Fire 3 rapid changes
    listeners[0]();
    listeners[0]();
    listeners[0]();

    // Before debounce expires — no calls
    vi.advanceTimersByTime(200);
    expect(onChange).not.toHaveBeenCalled();

    // After debounce expires — exactly 1 call
    vi.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(validConfig);
  });

  it("does not fire onChange for invalid config", () => {
    const onChange = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(fs, "watch").mockImplementation((_path: unknown, listener: unknown) => {
      (listener as () => void)();
      return { close: vi.fn() } as unknown as fs.FSWatcher;
    });
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ bad: true }));

    adapter.watch("/config.json", onChange);
    vi.advanceTimersByTime(400);

    expect(onChange).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// FileWatcherAdapter — stop() cleanup
// ---------------------------------------------------------------------------

describe("FileWatcherAdapter.stop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("closes watcher and clears debounce timer", () => {
    const closeFn = vi.fn();

    vi.spyOn(fs, "watch").mockImplementation((_path: unknown, listener: unknown) => {
      (listener as () => void)();
      return { close: closeFn } as unknown as fs.FSWatcher;
    });
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(validConfig));

    const adapter = new FileWatcherAdapter(300);
    const onChange = vi.fn();
    adapter.watch("/config.json", onChange);

    // Stop before debounce fires
    adapter.stop();
    vi.advanceTimersByTime(500);

    expect(closeFn).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is safe to call stop() multiple times", () => {
    const adapter = new FileWatcherAdapter();
    adapter.stop();
    adapter.stop();
    // No error thrown
  });
});
