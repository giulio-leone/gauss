import { describe, expect, it } from "vitest";
import { EvalMetricsSchema, EvalResultSchema } from "../eval.schema.js";

describe("Eval Schemas", () => {
  describe("EvalMetricsSchema", () => {
    it("should parse valid metrics", () => {
      const data = {
        latencyMs: 1500,
        stepCount: 5,
        toolCalls: { "search": 2, "write": 1 },
        tokenUsage: {
          prompt: 100,
          completion: 50,
          total: 150,
        },
        customScores: { "accuracy": 0.85, "relevance": 0.92 },
      };

      const result = EvalMetricsSchema.parse(data);
      expect(result).toEqual(data);
    });

    it("should apply customScores default", () => {
      const data = {
        latencyMs: 1000,
        stepCount: 3,
        toolCalls: { "tool1": 1 },
      };

      const result = EvalMetricsSchema.parse(data);
      expect(result.customScores).toEqual({});
    });

    it("should handle optional tokenUsage", () => {
      const data = {
        latencyMs: 1000,
        stepCount: 3,
        toolCalls: { "tool1": 1 },
        customScores: { "test": 0.5 },
      };

      const result = EvalMetricsSchema.parse(data);
      expect(result.tokenUsage).toBeUndefined();
    });

    it("should apply tokenUsage defaults", () => {
      const data = {
        latencyMs: 1000,
        stepCount: 3,
        toolCalls: {},
        tokenUsage: {},
      };

      const result = EvalMetricsSchema.parse(data);
      expect(result.tokenUsage).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it("should validate required fields", () => {
      expect(() => EvalMetricsSchema.parse({})).toThrow();
      expect(() => EvalMetricsSchema.parse({ latencyMs: 100 })).toThrow();
      expect(() => EvalMetricsSchema.parse({ 
        latencyMs: 100, 
        stepCount: 1 
      })).toThrow();
    });
  });

  describe("EvalResultSchema", () => {
    it("should parse valid result", () => {
      const data = {
        id: "eval-123",
        sessionId: "session-456",
        prompt: "What is TypeScript?",
        output: "TypeScript is a typed superset of JavaScript.",
        metrics: {
          latencyMs: 800,
          stepCount: 2,
          toolCalls: { "search": 1 },
          customScores: { "quality": 0.9 },
        },
        createdAt: 1234567890,
      };

      const result = EvalResultSchema.parse(data);
      expect(result).toEqual(data);
    });

    it("should apply createdAt default", () => {
      const now = Date.now();
      const data = {
        id: "eval-123",
        sessionId: "session-456",
        prompt: "Test prompt",
        output: "Test output",
        metrics: {
          latencyMs: 500,
          stepCount: 1,
          toolCalls: {},
          customScores: {},
        },
      };

      const result = EvalResultSchema.parse(data);
      expect(result.createdAt).toBeGreaterThanOrEqual(now);
    });

    it("should validate required fields", () => {
      expect(() => EvalResultSchema.parse({})).toThrow();
      
      expect(() => EvalResultSchema.parse({
        id: "eval-123",
        sessionId: "session-456",
        prompt: "test",
        // missing output and metrics
      })).toThrow();
    });

    it("should validate nested metrics", () => {
      const data = {
        id: "eval-123",
        sessionId: "session-456",
        prompt: "Test prompt",
        output: "Test output",
        metrics: {
          // missing required fields
          customScores: {},
        },
      };

      expect(() => EvalResultSchema.parse(data)).toThrow();
    });
  });
});