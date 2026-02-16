import { vi } from "vitest";
import type { PluginContext, PluginSetupContext } from "../../ports/plugin.port.js";
import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import { ConsoleLoggingAdapter } from "../../adapters/logging/console-logging.adapter.js";

/**
 * Creates a standard mock PluginContext for tests.
 */
export function createMockContext(overrides?: Partial<PluginContext>): PluginContext {
  return {
    sessionId: "test-session",
    config: { instructions: "test", maxSteps: 10 },
    filesystem: new VirtualFilesystem(),
    memory: new InMemoryAdapter(),
    toolNames: ["tool1"],
    ...overrides,
  };
}

/**
 * Creates a standard mock PluginSetupContext for tests.
 */
export function createMockSetupContext(overrides?: Partial<PluginSetupContext>): PluginSetupContext {
  return {
    logger: new ConsoleLoggingAdapter(),
    memory: new InMemoryAdapter(),
    filesystem: new VirtualFilesystem(),
    ...overrides,
  };
}

/**
 * Creates console spies for all log levels. Returns a restore function.
 */
export function createConsoleSpy() {
  const spies = {
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
  return {
    ...spies,
    restore() {
      spies.debug.mockRestore();
      spies.info.mockRestore();
      spies.warn.mockRestore();
      spies.error.mockRestore();
    },
  };
}
