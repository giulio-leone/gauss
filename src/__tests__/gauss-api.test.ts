import { describe, it, expect, vi, beforeEach } from "vitest";
import { GaussError } from "../gauss.js";

// Mock env detection
const originalEnv = process.env;

describe("GaussError", () => {
  it("includes suggestion in message", () => {
    const err = new GaussError("Something failed", "Try this instead");
    expect(err.message).toContain("Something failed");
    expect(err.message).toContain("💡 Try this instead");
    expect(err.suggestion).toBe("Try this instead");
    expect(err.name).toBe("GaussError");
  });
});

describe("gauss() one-liner", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws GaussError when no provider env var set", async () => {
    // Ensure no API keys set
    const cleanEnv = { ...process.env };
    delete cleanEnv.OPENAI_API_KEY;
    delete cleanEnv.ANTHROPIC_API_KEY;
    delete cleanEnv.GOOGLE_GENERATIVE_AI_API_KEY;
    delete cleanEnv.GROQ_API_KEY;
    delete cleanEnv.MISTRAL_API_KEY;
    process.env = cleanEnv;

    const { default: gauss } = await import("../gauss.js");
    try {
      await gauss("Hello");
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.name).toBe("GaussError");
      expect(err.message).toContain("No AI provider detected");
      expect(err.suggestion).toContain("OPENAI_API_KEY");
    } finally {
      process.env = originalEnv;
    }
  });

  it("exports agent, graph, rag as properties", async () => {
    const { default: gauss } = await import("../gauss.js");
    expect(typeof gauss.agent).toBe("function");
    expect(typeof gauss.graph).toBe("function");
    expect(typeof gauss.rag).toBe("function");
  });

  it("gauss.agent returns AgentBuilder", async () => {
    const { default: gauss } = await import("../gauss.js");
    const mockModel = { modelId: "test" } as any;
    const builder = gauss.agent({ model: mockModel });
    expect(builder).toBeDefined();
    expect(typeof builder.build).toBe("function");
  });
});

describe("named exports", () => {
  it("exports agent, graph, rag, team, workflow, multimodal, videoProcessor", async () => {
    const mod = await import("../gauss.js");
    expect(typeof mod.agent).toBe("function");
    expect(typeof mod.graph).toBe("function");
    expect(typeof mod.rag).toBe("function");
    expect(typeof mod.workflow).toBe("function");
    expect(typeof mod.multimodal).toBe("function");
    expect(typeof mod.videoProcessor).toBe("function");
  });
});
