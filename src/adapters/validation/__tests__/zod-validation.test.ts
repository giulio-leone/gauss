import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationAdapter } from "../zod-validation.adapter.js";

describe("ZodValidationAdapter", () => {
  const adapter = new ZodValidationAdapter();

  describe("validate()", () => {
    it("should return success with data for valid input", () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = adapter.validate(schema, { name: "Alice", age: 30 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "Alice", age: 30 });
      expect(result.error).toBeUndefined();
    });

    it("should return failure with error for invalid input", () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = adapter.validate(schema, { name: 123, age: "bad" });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    });

    it("should work with z.string()", () => {
      const schema = z.string().min(3);
      expect(adapter.validate(schema, "hello").success).toBe(true);
      expect(adapter.validate(schema, "hi").success).toBe(false);
    });

    it("should work with z.number()", () => {
      const schema = z.number().positive();
      expect(adapter.validate(schema, 42).success).toBe(true);
      expect(adapter.validate(schema, -1).success).toBe(false);
    });
  });

  describe("validateOrThrow()", () => {
    it("should return data on valid input", () => {
      const schema = z.object({ url: z.string().url() });
      const data = adapter.validateOrThrow(schema, { url: "https://example.com" });
      expect(data).toEqual({ url: "https://example.com" });
    });

    it("should throw on invalid input", () => {
      const schema = z.string().email();
      expect(() => adapter.validateOrThrow(schema, "not-an-email")).toThrow();
    });

    it("should work with z.object schemas", () => {
      const schema = z.object({
        query: z.string(),
        limit: z.number().min(1).max(20).default(5),
      });
      const data = adapter.validateOrThrow(schema, { query: "test", limit: 10 });
      expect(data).toEqual({ query: "test", limit: 10 });
    });
  });
});
