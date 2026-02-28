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
      expect(isValidProvider("openRouter")).toBe(false);
    });
  });

  describe("getDefaultModel", () => {
    it("returns gpt-5.2 for openai", () => {
      expect(getDefaultModel("openai")).toBe("gpt-5.2");
    });

    it("returns claude-sonnet-4-20250514 for anthropic", () => {
      expect(getDefaultModel("anthropic")).toBe("claude-sonnet-4-20250514");
    });

    it("returns gemini-2.5-flash-preview-05-20 for google", () => {
      expect(getDefaultModel("google")).toBe("gemini-2.5-flash-preview-05-20");
    });

    it("returns llama-3.3-70b-versatile for groq", () => {
      expect(getDefaultModel("groq")).toBe("llama-3.3-70b-versatile");
    });

    it("returns mistral-large-latest for mistral", () => {
      expect(getDefaultModel("mistral")).toBe("mistral-large-latest");
    });

    it("returns openai/gpt-5.2 for openrouter", () => {
      expect(getDefaultModel("openrouter")).toBe("openai/gpt-5.2");
    });
  });

  describe("SUPPORTED_PROVIDERS", () => {
    it("contains exactly 6 providers", () => {
      expect(SUPPORTED_PROVIDERS).toHaveLength(6);
    });

    it("contains all expected providers", () => {
      expect(SUPPORTED_PROVIDERS).toContain("openai");
      expect(SUPPORTED_PROVIDERS).toContain("anthropic");
      expect(SUPPORTED_PROVIDERS).toContain("google");
      expect(SUPPORTED_PROVIDERS).toContain("groq");
      expect(SUPPORTED_PROVIDERS).toContain("mistral");
      expect(SUPPORTED_PROVIDERS).toContain("openrouter");
    });
  });
});
