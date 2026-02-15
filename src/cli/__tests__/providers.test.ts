// =============================================================================
// Tests — CLI Providers
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import {
  isValidProvider,
  getDefaultModel,
  SUPPORTED_PROVIDERS,
} from "../providers.js";

describe("CLI Providers", () => {
  describe("isValidProvider", () => {
    it("returns true for all supported providers", () => {
      for (const provider of SUPPORTED_PROVIDERS) {
        expect(isValidProvider(provider)).toBe(true);
      }
    });

    it("returns false for unknown providers", () => {
      expect(isValidProvider("unknown")).toBe(false);
      expect(isValidProvider("")).toBe(false);
      expect(isValidProvider("openAI")).toBe(false);
    });
  });

  describe("getDefaultModel", () => {
    it("returns gpt-4o for openai", () => {
      expect(getDefaultModel("openai")).toBe("gpt-4o");
    });

    it("returns claude-sonnet-4-20250514 for anthropic", () => {
      expect(getDefaultModel("anthropic")).toBe("claude-sonnet-4-20250514");
    });

    it("returns gemini-2.0-flash for google", () => {
      expect(getDefaultModel("google")).toBe("gemini-2.0-flash");
    });

    it("returns llama-3.3-70b-versatile for groq", () => {
      expect(getDefaultModel("groq")).toBe("llama-3.3-70b-versatile");
    });

    it("returns mistral-large-latest for mistral", () => {
      expect(getDefaultModel("mistral")).toBe("mistral-large-latest");
    });
  });

  describe("SUPPORTED_PROVIDERS", () => {
    it("contains exactly 5 providers", () => {
      expect(SUPPORTED_PROVIDERS).toHaveLength(5);
    });

    it("contains all expected providers", () => {
      expect(SUPPORTED_PROVIDERS).toContain("openai");
      expect(SUPPORTED_PROVIDERS).toContain("anthropic");
      expect(SUPPORTED_PROVIDERS).toContain("google");
      expect(SUPPORTED_PROVIDERS).toContain("groq");
      expect(SUPPORTED_PROVIDERS).toContain("mistral");
    });
  });
});
