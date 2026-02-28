import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToJsonSchema, validateWithZod } from "../core/schema/zod-to-json-schema.js";

describe("zodToJsonSchema", () => {
  it("returns empty object for null/undefined", () => {
    expect(zodToJsonSchema(null)).toEqual({});
    expect(zodToJsonSchema(undefined)).toEqual({});
  });

  it("converts ZodString", () => {
    expect(zodToJsonSchema(z.string())).toEqual({ type: "string" });
  });

  it("converts ZodString with description", () => {
    const result = zodToJsonSchema(z.string().describe("A name"));
    expect(result.type).toBe("string");
    expect(result.description).toBe("A name");
  });

  it("converts ZodNumber", () => {
    expect(zodToJsonSchema(z.number())).toEqual({ type: "number" });
  });

  it("converts ZodBoolean", () => {
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: "boolean" });
  });

  it("converts ZodNull", () => {
    expect(zodToJsonSchema(z.null())).toEqual({ type: "null" });
  });

  it("converts ZodLiteral string", () => {
    const result = zodToJsonSchema(z.literal("hello"));
    expect(result.type).toBe("string");
    expect(result.const).toBe("hello");
  });

  it("converts ZodLiteral number", () => {
    const result = zodToJsonSchema(z.literal(42));
    expect(result.type).toBe("number");
    expect(result.const).toBe(42);
  });

  it("converts ZodEnum", () => {
    const result = zodToJsonSchema(z.enum(["a", "b", "c"]));
    expect(result.type).toBe("string");
    expect(result.enum).toEqual(["a", "b", "c"]);
  });

  it("converts ZodObject with required and optional fields", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
      active: z.boolean(),
    });
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe("object");
    expect(result.properties).toBeDefined();
    expect(result.required).toEqual(["name", "active"]);
    expect(result.additionalProperties).toBe(false);
  });

  it("converts nested ZodObject", () => {
    const schema = z.object({
      user: z.object({ name: z.string(), email: z.string() }),
    });
    const result = zodToJsonSchema(schema);
    const userProp = (result.properties as Record<string, Record<string, unknown>>).user;
    expect(userProp.type).toBe("object");
    expect(userProp.properties).toBeDefined();
  });

  it("converts ZodArray", () => {
    const schema = z.array(z.string());
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe("array");
    expect(result.items).toEqual({ type: "string" });
  });

  it("converts ZodOptional (unwraps)", () => {
    const result = zodToJsonSchema(z.string().optional());
    expect(result.type).toBe("string");
  });

  it("converts ZodNullable", () => {
    const result = zodToJsonSchema(z.string().nullable());
    // Zod v4 produces anyOf for nullable
    expect(result.anyOf).toEqual([{ type: "string" }, { type: "null" }]);
  });

  it("converts ZodDefault (unwraps, keeps default)", () => {
    const result = zodToJsonSchema(z.string().default("hello"));
    expect(result.type).toBe("string");
  });

  it("converts ZodUnion", () => {
    const result = zodToJsonSchema(z.union([z.string(), z.number()]));
    expect(result.anyOf).toBeDefined();
    expect((result.anyOf as unknown[]).length).toBe(2);
  });

  it("converts ZodRecord", () => {
    const result = zodToJsonSchema(z.record(z.string(), z.number()));
    expect(result.type).toBe("object");
    expect(result.additionalProperties).toEqual({ type: "number" });
  });

  it("converts ZodAny to empty schema", () => {
    const result = zodToJsonSchema(z.any());
    expect(result.type).toBeUndefined();
  });

  it("handles complex real-world schema", () => {
    const schema = z.object({
      name: z.string().describe("Agent name"),
      model: z.enum(["gpt-4", "claude-3"]),
      temperature: z.number().optional(),
      tools: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
      })).optional(),
    });
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe("object");
    expect(result.required).toEqual(["name", "model"]);
    const props = result.properties as Record<string, Record<string, unknown>>;
    expect(props.name.description).toBe("Agent name");
    expect(props.model.enum).toEqual(["gpt-4", "claude-3"]);
    expect(props.tools.type).toBe("array");
  });
});

describe("validateWithZod", () => {
  it("returns success for null schema", () => {
    const result = validateWithZod(null, { anything: true });
    expect(result.success).toBe(true);
  });

  it("validates valid data", () => {
    const schema = z.object({ name: z.string() });
    const result = validateWithZod(schema, { name: "test" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ name: "test" });
  });

  it("rejects invalid data", () => {
    const schema = z.object({ name: z.string() });
    const result = validateWithZod(schema, { name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeDefined();
  });

  it("handles non-Zod schema gracefully", () => {
    const result = validateWithZod({ notAZodSchema: true }, "data");
    expect(result.success).toBe(true);
  });
});
