import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToTypeScript, generateTypes } from "../type-builder.js";

describe("TypeBuilder", () => {
  it("generates interface from ZodObject", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const result = zodToTypeScript("User", schema);
    expect(result).toContain("export interface User");
    expect(result).toContain("name: string;");
    expect(result).toContain("age: number;");
  });

  it("handles optional fields", () => {
    const schema = z.object({
      name: z.string(),
      bio: z.string().optional(),
    });
    const result = zodToTypeScript("Profile", schema);
    expect(result).toContain("name: string;");
    expect(result).toContain("bio?: string;");
  });

  it("handles nullable fields", () => {
    const schema = z.object({
      email: z.string().nullable(),
    });
    const result = zodToTypeScript("Contact", schema);
    expect(result).toContain("email: string | null;");
  });

  it("handles arrays", () => {
    const schema = z.object({
      tags: z.array(z.string()),
    });
    const result = zodToTypeScript("Post", schema);
    expect(result).toContain("tags: string[];");
  });

  it("handles enums", () => {
    const schema = z.object({
      status: z.enum(["active", "inactive", "banned"]),
    });
    const result = zodToTypeScript("Account", schema);
    expect(result).toContain('"active" | "inactive" | "banned"');
  });

  it("handles literals", () => {
    const schema = z.object({
      type: z.literal("admin"),
    });
    const result = zodToTypeScript("Role", schema);
    expect(result).toContain('"admin"');
  });

  it("handles records", () => {
    const schema = z.object({
      metadata: z.record(z.string(), z.unknown()),
    });
    const result = zodToTypeScript("Entry", schema);
    expect(result).toContain("Record<string, unknown>");
  });

  it("handles nested objects (inline)", () => {
    const schema = z.object({
      address: z.object({
        street: z.string(),
        zip: z.string(),
      }),
    });
    const result = zodToTypeScript("Person", schema);
    expect(result).toContain("address: { street: string; zip: string };");
  });

  it("handles union types", () => {
    const schema = z.union([z.string(), z.number()]);
    const result = zodToTypeScript("StringOrNum", schema);
    expect(result).toContain("string | number");
  });

  it("handles boolean, date, bigint, symbol", () => {
    const schema = z.object({
      flag: z.boolean(),
      created: z.date(),
      big: z.bigint(),
    });
    const result = zodToTypeScript("Mixed", schema);
    expect(result).toContain("flag: boolean;");
    expect(result).toContain("created: Date;");
    expect(result).toContain("big: bigint;");
  });

  it("handles descriptions as JSDoc", () => {
    const schema = z.object({
      name: z.string().describe("The user's full name"),
    }).describe("A user entity");
    const result = zodToTypeScript("User", schema);
    expect(result).toContain("/** A user entity */");
    expect(result).toContain("/** The user's full name */");
  });

  it("handles default values", () => {
    const schema = z.object({
      count: z.number().default(0),
    });
    const result = zodToTypeScript("Counter", schema);
    expect(result).toContain("count?: number;");
  });

  it("generates type alias for non-object", () => {
    const schema = z.string();
    const result = zodToTypeScript("Name", schema);
    expect(result).toContain("export type Name = string;");
  });

  it("generateTypes handles multiple schemas", () => {
    const schemas = {
      User: z.object({ name: z.string() }),
      Post: z.object({ title: z.string() }),
    };
    const result = generateTypes(schemas);
    expect(result).toContain("interface User");
    expect(result).toContain("interface Post");
  });

  it("handles tuples", () => {
    const schema = z.tuple([z.string(), z.number()]);
    const result = zodToTypeScript("Pair", schema);
    expect(result).toContain("[string, number]");
  });

  it("respects exportKeyword option", () => {
    const schema = z.object({ x: z.number() });
    const result = zodToTypeScript("Point", schema, { exportKeyword: "" });
    expect(result).toContain("interface Point");
    expect(result).not.toContain("export ");
  });
});
