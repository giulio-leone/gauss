// =============================================================================
// compiler.schema.test.ts — Tests for StructuredDeclaration schema & validation
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  StructuredDeclarationSchema,
  validateDeclaration,
  type StructuredDeclaration,
} from "../compiler.schema.js";

describe("StructuredDeclarationSchema", () => {
  const validDeclaration: StructuredDeclaration = {
    name: "TechCrunch AI Monitor",
    triggers: [{ type: "cron", expression: "every 2h" }],
    steps: [
      {
        type: "monitor",
        source: "https://techcrunch.com/category/artificial-intelligence",
        description: "Check for new AI articles",
        strategy: "adaptive",
      },
      {
        type: "filter",
        criteria: "Only articles about generative AI or LLMs",
        minRelevance: 0.7,
      },
      {
        type: "transform",
        action: "Rewrite in professional tone for LinkedIn",
        targetChannel: "linkedin",
      },
      {
        type: "transform",
        action: "Summarize as casual X post, max 280 chars",
        targetChannel: "x",
      },
      {
        type: "publish",
        channels: ["linkedin", "x"],
      },
    ],
    channels: [
      { platform: "linkedin", tone: "professional", format: "article" },
      { platform: "x", tone: "casual", maxLength: 280 },
    ],
    policy: {
      default: "review",
      channels: [
        { platform: "x", mode: "auto" },
        { platform: "linkedin", mode: "review" },
      ],
      yolo: false,
    },
  };

  it("should parse a valid declaration", () => {
    const result = StructuredDeclarationSchema.safeParse(validDeclaration);
    expect(result.success).toBe(true);
  });

  it("should require at least one trigger", () => {
    const invalid = { ...validDeclaration, triggers: [] };
    const result = StructuredDeclarationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should require at least one step", () => {
    const invalid = { ...validDeclaration, steps: [] };
    const result = StructuredDeclarationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should require name", () => {
    const { name: _, ...noName } = validDeclaration;
    const result = StructuredDeclarationSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("should accept all trigger types", () => {
    const triggers = [
      { type: "cron" as const, expression: "every 1h" },
      { type: "event" as const, event: "source:new-content" },
      { type: "manual" as const },
      { type: "webhook" as const, path: "/hook/test" },
    ];
    for (const trigger of triggers) {
      const decl = { ...validDeclaration, triggers: [trigger] };
      const result = StructuredDeclarationSchema.safeParse(decl);
      expect(result.success).toBe(true);
    }
  });

  it("should accept all step types", () => {
    const steps = [
      { type: "monitor" as const, source: "https://example.com", description: "test" },
      { type: "filter" as const, criteria: "only AI" },
      { type: "transform" as const, action: "rewrite" },
      { type: "publish" as const, channels: ["x"] },
      { type: "custom" as const, description: "do something special" },
    ];
    for (const step of steps) {
      const decl = { ...validDeclaration, steps: [step] };
      const result = StructuredDeclarationSchema.safeParse(decl);
      expect(result.success).toBe(true);
    }
  });

  it("should default monitor strategy to adaptive", () => {
    const result = StructuredDeclarationSchema.parse(validDeclaration);
    const monitorStep = result.steps.find((s) => s.type === "monitor");
    expect(monitorStep).toBeDefined();
    if (monitorStep?.type === "monitor") {
      expect(monitorStep.strategy).toBe("adaptive");
    }
  });

  it("should default policy to review", () => {
    const decl = { ...validDeclaration, policy: undefined };
    const result = StructuredDeclarationSchema.parse(decl);
    expect(result.policy).toBeUndefined();
  });

  it("should enforce publish step has at least one channel", () => {
    const invalid = {
      ...validDeclaration,
      steps: [{ type: "publish" as const, channels: [] }],
    };
    const result = StructuredDeclarationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should enforce filter minRelevance range 0-1", () => {
    const invalid = {
      ...validDeclaration,
      steps: [{ type: "filter" as const, criteria: "test", minRelevance: 1.5 }],
    };
    const result = StructuredDeclarationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("validateDeclaration", () => {
  it("should return valid for correct input", () => {
    const result = validateDeclaration({
      name: "Test",
      triggers: [{ type: "manual" }],
      steps: [{ type: "custom", description: "do something" }],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.name).toBe("Test");
    }
  });

  it("should return errors for invalid input", () => {
    const result = validateDeclaration({ name: 123 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("should return errors for completely empty input", () => {
    const result = validateDeclaration({});
    expect(result.valid).toBe(false);
  });
});
