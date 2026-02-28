// =============================================================================
// Tests: Native Bridge — generateText/streamText → Rust delegation
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { isNativeModel, GAUSS_NATIVE_MARKER } from "../native-bridge.js";

describe("native-bridge", () => {
  describe("isNativeModel()", () => {
    it("returns false for regular LanguageModel", () => {
      const model = {
        specificationVersion: "v1",
        provider: "openai",
        modelId: "gpt-4o",
        defaultObjectGenerationMode: "json",
        doGenerate: vi.fn(),
        doStream: vi.fn(),
      };
      expect(isNativeModel(model)).toBe(false);
    });

    it("returns true for model with GAUSS_NATIVE_MARKER", () => {
      const model = {
        specificationVersion: "v1",
        provider: "gauss-openai",
        modelId: "gpt-4o",
        defaultObjectGenerationMode: "json",
        [GAUSS_NATIVE_MARKER]: true,
        getHandle: () => 42,
        doGenerate: vi.fn(),
        doStream: vi.fn(),
      };
      expect(isNativeModel(model)).toBe(true);
    });

    it("returns false if marker is not true", () => {
      const model = {
        specificationVersion: "v1",
        provider: "test",
        modelId: "test",
        [GAUSS_NATIVE_MARKER]: false,
        getHandle: () => 0,
        doGenerate: vi.fn(),
        doStream: vi.fn(),
      };
      expect(isNativeModel(model)).toBe(false);
    });
  });

  describe("GAUSS_NATIVE_MARKER", () => {
    it("is a globally registered symbol", () => {
      expect(typeof GAUSS_NATIVE_MARKER).toBe("symbol");
      expect(GAUSS_NATIVE_MARKER).toBe(Symbol.for("gauss.native.model"));
    });
  });
});
