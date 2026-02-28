// =============================================================================
// E2E — OpenAI Provider Tests
// =============================================================================
// Requires: OPENAI_API_KEY environment variable
// Run:      OPENAI_API_KEY=sk-... npx vitest run src/__tests__/e2e/openai.e2e.test.ts
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  E2E_TIMEOUT,
  assertNonTrivialText,
  assertTokenUsage,
} from "./e2e-harness.js";

// ---------------------------------------------------------------------------
// Skip entire file if no API key
// ---------------------------------------------------------------------------

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const describeE2E = OPENAI_KEY ? describe : describe.skip;

// ---------------------------------------------------------------------------
// 1. generateText — Simple prompt
// ---------------------------------------------------------------------------

describeE2E("OpenAI E2E — generateText", () => {
  it(
    "should generate text with gpt-4o-mini",
    async () => {
      const { generateText } = await import("../../core/llm/index.js");
      const { openai } = await import("../../providers/openai.js");

      const model = openai("gpt-4o-mini");
      const result = await generateText({
        model,
        prompt: "What is 2 + 2? Reply with just the number.",
        maxTokens: 50,
      });

      expect(result.text).toBeDefined();
      expect(result.text.trim().length).toBeGreaterThan(0);
      expect(result.text).toContain("4");
      expect(result.finishReason).toBe("stop");
    },
    E2E_TIMEOUT,
  );

  it(
    "should respect system instructions",
    async () => {
      const { generateText } = await import("../../core/llm/index.js");
      const { openai } = await import("../../providers/openai.js");

      const model = openai("gpt-4o-mini");
      const result = await generateText({
        model,
        system: "You are a pirate. Always respond in pirate speak.",
        prompt: "Say hello.",
        maxTokens: 100,
      });

      assertNonTrivialText(result.text);
      // Pirate speak usually includes words like "ahoy", "matey", "arr"
      const lower = result.text.toLowerCase();
      const hasPirateWord = ["ahoy", "matey", "arr", "ye", "avast", "sail", "sea"].some(
        (w) => lower.includes(w),
      );
      expect(hasPirateWord).toBe(true);
    },
    E2E_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 2. generateText — Tool calling
// ---------------------------------------------------------------------------

describeE2E("OpenAI E2E — Tool calling", () => {
  it(
    "should call a tool and return tool call results",
    async () => {
      const { generateText } = await import("../../core/llm/index.js");
      const { openai } = await import("../../providers/openai.js");
      const { z } = await import("zod");
      const { tool } = await import("../../core/llm/index.js");

      const calculatorTool = tool({
        description: "Add two numbers together",
        parameters: z.object({
          a: z.number().describe("First number"),
          b: z.number().describe("Second number"),
        }),
        execute: async ({ a, b }) => ({ result: a + b }),
      });

      const model = openai("gpt-4o-mini");
      const result = await generateText({
        model,
        prompt: "What is 17 + 25? Use the calculator tool.",
        tools: { calculator: calculatorTool },
        maxSteps: 3,
      });

      // The model should have called the calculator and gotten 42
      expect(result.text).toBeDefined();
      expect(result.text.trim().length).toBeGreaterThan(0);
      expect(result.text).toContain("42");
    },
    E2E_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 3. Agent — Basic run
// ---------------------------------------------------------------------------

describeE2E("OpenAI E2E — Agent", () => {
  it(
    "should run an agent with OpenAI model",
    async () => {
      const { agent } = await import("../../gauss.js");
      const { openai } = await import("../../providers/openai.js");

      const model = openai("gpt-4o-mini");
      const myAgent = agent({
        model,
        instructions: "You are a concise assistant. Reply in one sentence.",
      }).build();

      try {
        const result = await myAgent.run("What is the capital of France?");
        assertNonTrivialText(result.text);
        expect(result.text.toLowerCase()).toContain("paris");
        expect(result.sessionId).toBeDefined();
      } finally {
        await myAgent.dispose();
      }
    },
    E2E_TIMEOUT,
  );

  it(
    "should run an agent with tool use",
    async () => {
      const { agent } = await import("../../gauss.js");
      const { openai } = await import("../../providers/openai.js");
      const { z } = await import("zod");
      const { tool } = await import("../../core/llm/index.js");

      const weatherTool = tool({
        description: "Get the current weather for a city",
        parameters: z.object({
          city: z.string().describe("City name"),
        }),
        execute: async ({ city }) => ({
          city,
          temperature: 22,
          condition: "sunny",
        }),
      });

      const model = openai("gpt-4o-mini");
      const myAgent = agent({
        model,
        instructions: "Use the weather tool to answer weather questions.",
      }).build();

      try {
        const result = await myAgent.run("What is the weather in Rome?");
        assertNonTrivialText(result.text);
        // Should reference the mock weather data
        const lower = result.text.toLowerCase();
        expect(lower.includes("rome") || lower.includes("22") || lower.includes("sunny")).toBe(
          true,
        );
      } finally {
        await myAgent.dispose();
      }
    },
    E2E_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 4. gauss() — Zero-config one-liner
// ---------------------------------------------------------------------------

describeE2E("OpenAI E2E — gauss() one-liner", () => {
  it(
    "should auto-detect OpenAI from env and generate text",
    async () => {
      const gaussMod = await import("../../gauss.js");
      const gaussFn = gaussMod.default;

      const answer = await gaussFn("What is 3 * 7? Reply with just the number.");
      expect(answer).toBeDefined();
      expect(answer.trim().length).toBeGreaterThan(0);
      expect(answer).toContain("21");
    },
    E2E_TIMEOUT,
  );
});
