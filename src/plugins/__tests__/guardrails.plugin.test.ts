import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { GuardrailsPlugin, GuardrailsError, createPiiFilter } from "../guardrails.plugin.js";
import type { PluginContext } from "../../ports/plugin.port.js";
import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";

function createMockContext(): PluginContext {
  return {
    sessionId: "test-session",
    config: { instructions: "test", maxSteps: 10 },
    filesystem: new VirtualFilesystem(),
    memory: new InMemoryAdapter(),
    toolNames: ["tool1"],
  };
}

describe("GuardrailsPlugin", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("inputSchema validation", () => {
    it("should pass for valid input", () => {
      const plugin = new GuardrailsPlugin({
        inputSchema: z.string().min(1),
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.beforeRun!(ctx, { prompt: "hello" });
      }).not.toThrow();
    });

    it("should fail for invalid input", () => {
      const plugin = new GuardrailsPlugin({
        inputSchema: z.string().min(1),
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.beforeRun!(ctx, { prompt: "" });
      }).toThrow(GuardrailsError);
    });
  });

  describe("outputSchema validation", () => {
    it("should pass for valid output", () => {
      const plugin = new GuardrailsPlugin({
        outputSchema: z.string().max(100),
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.afterRun!(ctx, {
          result: { text: "short text", steps: [], sessionId: "test" }
        });
      }).not.toThrow();
    });

    it("should fail for invalid output", () => {
      const plugin = new GuardrailsPlugin({
        outputSchema: z.string().max(10),
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.afterRun!(ctx, {
          result: { text: "this text is too long for validation", steps: [], sessionId: "test" }
        });
      }).toThrow(GuardrailsError);
    });
  });

  describe("content filters", () => {
    it("should block content matching filters", () => {
      const plugin = new GuardrailsPlugin({
        contentFilters: [{
          name: "test",
          test: (content: string) => content.includes("blocked")
        }],
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.beforeRun!(ctx, { prompt: "this is blocked content" });
      }).toThrow(GuardrailsError);

      expect(() => {
        plugin.hooks.afterRun!(ctx, {
          result: { text: "output with blocked word", steps: [], sessionId: "test" }
        });
      }).toThrow(GuardrailsError);
    });

    it("should allow content not matching filters", () => {
      const plugin = new GuardrailsPlugin({
        contentFilters: [{
          name: "test",
          test: (content: string) => content.includes("blocked")
        }],
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.beforeRun!(ctx, { prompt: "safe content" });
      }).not.toThrow();
    });
  });

  describe("input validators", () => {
    it("should run custom input validators", () => {
      const plugin = new GuardrailsPlugin({
        inputValidators: [
          (prompt: string) => prompt.length < 5 ? "Too short" : null
        ],
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.beforeRun!(ctx, { prompt: "hi" });
      }).toThrow(GuardrailsError);

      expect(() => {
        plugin.hooks.beforeRun!(ctx, { prompt: "hello world" });
      }).not.toThrow();
    });
  });

  describe("output validators", () => {
    it("should run custom output validators", () => {
      const plugin = new GuardrailsPlugin({
        outputValidators: [
          (output: string) => output.includes("bad") ? "Contains bad word" : null
        ],
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.afterRun!(ctx, {
          result: { text: "this is bad output", steps: [], sessionId: "test" }
        });
      }).toThrow(GuardrailsError);

      expect(() => {
        plugin.hooks.afterRun!(ctx, {
          result: { text: "good output", steps: [], sessionId: "test" }
        });
      }).not.toThrow();
    });
  });

  describe("tool schemas", () => {
    it("should validate tool arguments", () => {
      const plugin = new GuardrailsPlugin({
        toolSchemas: {
          "testTool": z.object({ 
            name: z.string(),
            count: z.number().min(1)
          })
        },
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.beforeTool!(ctx, {
          toolName: "testTool",
          args: { name: "test", count: 5 }
        });
      }).not.toThrow();

      expect(() => {
        plugin.hooks.beforeTool!(ctx, {
          toolName: "testTool", 
          args: { name: "test", count: 0 }
        });
      }).toThrow(GuardrailsError);
    });

    it("should ignore tools without schemas", () => {
      const plugin = new GuardrailsPlugin({
        toolSchemas: {
          "testTool": z.object({ name: z.string() })
        },
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.beforeTool!(ctx, {
          toolName: "otherTool",
          args: { anything: "goes" }
        });
      }).not.toThrow();
    });
  });

  describe("onFailure behavior", () => {
    it("should warn instead of throw when onFailure=warn", () => {
      const plugin = new GuardrailsPlugin({
        inputSchema: z.string().min(10),
        onFailure: "warn",
      });
      const ctx = createMockContext();

      expect(() => {
        plugin.hooks.beforeRun!(ctx, { prompt: "short" });
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[guardrails]")
      );
    });
  });

  describe("GuardrailsError", () => {
    it("should have correct code field", () => {
      const error = new GuardrailsError("input_validation", "Test error");
      expect(error.code).toBe("input_validation");
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("GuardrailsError");
    });
  });
});

describe("createPiiFilter", () => {
  it("should detect email addresses", () => {
    const filter = createPiiFilter();
    expect(filter.test("Contact me at test@email.com")).toBe(true);
    expect(filter.test("Email: user.name+tag@example.org")).toBe(true);
    expect(filter.test("No email here")).toBe(false);
  });

  it("should detect SSN patterns", () => {
    const filter = createPiiFilter();
    expect(filter.test("SSN: 123-45-6789")).toBe(true);
    expect(filter.test("SSN: 123.45.6789")).toBe(true);
    expect(filter.test("SSN: 123456789")).toBe(true);
    expect(filter.test("Random numbers: 12345")).toBe(false);
  });

  it("should not have false positives for normal text", () => {
    const filter = createPiiFilter();
    expect(filter.test("hello world")).toBe(false);
    expect(filter.test("This is a normal sentence.")).toBe(false);
    expect(filter.test("Phone: 555-1234")).toBe(false); // Too short for SSN
  });
});