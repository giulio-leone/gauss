import { describe, expect, it } from "vitest";
import { UserProfileSchema, UserMemorySchema, SharedKnowledgeSchema } from "../learning.schema.js";

describe("Learning Schemas", () => {
  describe("UserProfileSchema", () => {
    it("should parse valid profile", () => {
      const data = {
        userId: "user123",
        preferences: { theme: "dark" },
        language: "en",
        style: "technical",
        context: "Developer working on React apps",
        updatedAt: 1234567890,
        createdAt: 1234567890,
      };

      const result = UserProfileSchema.parse(data);
      expect(result).toEqual(data);
    });

    it("should apply defaults", () => {
      const data = { userId: "user123" };
      const result = UserProfileSchema.parse(data);
      
      expect(result.preferences).toEqual({});
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    it("should handle optional fields", () => {
      const data = {
        userId: "user123",
        language: "es",
      };

      const result = UserProfileSchema.parse(data);
      expect(result.language).toBe("es");
      expect(result.style).toBeUndefined();
      expect(result.context).toBeUndefined();
    });
  });

  describe("UserMemorySchema", () => {
    it("should parse valid memory", () => {
      const data = {
        id: "mem123",
        content: "User prefers TypeScript",
        tags: ["programming", "typescript"],
        confidence: 0.8,
        source: "explicit",
        createdAt: 1234567890,
      };

      const result = UserMemorySchema.parse(data);
      expect(result).toEqual(data);
    });

    it("should apply defaults", () => {
      const data = {
        id: "mem123",
        content: "Some content",
      };

      const result = UserMemorySchema.parse(data);
      expect(result.tags).toEqual([]);
      expect(result.confidence).toBe(1);
      expect(result.source).toBe("inferred");
      expect(result.createdAt).toBeGreaterThan(0);
    });

    it("should validate confidence range", () => {
      expect(() => UserMemorySchema.parse({
        id: "mem123",
        content: "test",
        confidence: 1.5
      })).toThrow();

      expect(() => UserMemorySchema.parse({
        id: "mem123",
        content: "test",
        confidence: -0.1
      })).toThrow();
    });

    it("should validate source enum", () => {
      expect(() => UserMemorySchema.parse({
        id: "mem123",
        content: "test",
        source: "invalid"
      })).toThrow();
    });
  });

  describe("SharedKnowledgeSchema", () => {
    it("should parse valid knowledge", () => {
      const data = {
        id: "know123",
        content: "React uses virtual DOM",
        category: "frontend",
        tags: ["react", "dom"],
        usageCount: 5,
        createdAt: 1234567890,
      };

      const result = SharedKnowledgeSchema.parse(data);
      expect(result).toEqual(data);
    });

    it("should apply defaults", () => {
      const data = {
        id: "know123",
        content: "Some knowledge",
      };

      const result = SharedKnowledgeSchema.parse(data);
      expect(result.tags).toEqual([]);
      expect(result.usageCount).toBe(0);
      expect(result.createdAt).toBeGreaterThan(0);
    });

    it("should handle optional category", () => {
      const data = {
        id: "know123",
        content: "Knowledge without category",
      };

      const result = SharedKnowledgeSchema.parse(data);
      expect(result.category).toBeUndefined();
    });
  });
});