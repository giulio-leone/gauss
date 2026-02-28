// =============================================================================
// TypeBuilder — Generate TypeScript types from Zod schemas
// =============================================================================

import { z } from "zod";

export interface TypeBuilderOptions {
  /** Export keyword to use (default: "export") */
  exportKeyword?: "export" | "export type" | "";
  /** Indentation (default: "  ") */
  indent?: string;
  /** Add JSDoc comments from schema descriptions (default: true) */
  includeDescriptions?: boolean;
}

/**
 * Generate a TypeScript type declaration from a Zod schema.
 *
 * @example
 * ```ts
 * const schema = z.object({ name: z.string(), age: z.number().optional() });
 * console.log(zodToTypeScript("User", schema));
 * // export interface User {
 * //   name: string;
 * //   age?: number;
 * // }
 * ```
 */
export function zodToTypeScript(
  name: string,
  schema: z.ZodTypeAny,
  options: TypeBuilderOptions = {},
): string {
  const exp = options.exportKeyword ?? "export";
  const includeDesc = options.includeDescriptions ?? true;
  const indent = options.indent ?? "  ";

  const desc = schema.description;
  const descComment = includeDesc && desc ? `/** ${desc} */\n` : "";

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const fields = Object.entries(shape).map(([key, field]) => {
      const optional = field.isOptional();
      const typeStr = zodTypeToTS(field, indent, includeDesc);
      const fieldDesc = includeDesc && field.description
        ? `${indent}/** ${field.description} */\n`
        : "";
      return `${fieldDesc}${indent}${key}${optional ? "?" : ""}: ${typeStr};`;
    });
    return `${descComment}${exp} interface ${name} {\n${fields.join("\n")}\n}`;
  }

  // Non-object schemas become type aliases
  const typeStr = zodTypeToTS(schema, indent, includeDesc);
  return `${descComment}${exp} type ${name} = ${typeStr};`;
}

function zodTypeToTS(schema: z.ZodTypeAny, indent: string, includeDesc: boolean): string {
  // Unwrap optional/nullable/default
  if (schema instanceof z.ZodOptional) {
    return zodTypeToTS(schema.unwrap(), indent, includeDesc);
  }
  if (schema instanceof z.ZodNullable) {
    return `${zodTypeToTS(schema.unwrap(), indent, includeDesc)} | null`;
  }
  if (schema instanceof z.ZodDefault) {
    return zodTypeToTS(schema.removeDefault(), indent, includeDesc);
  }

  // Primitives
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodDate) return "Date";
  if (schema instanceof z.ZodUndefined) return "undefined";
  if (schema instanceof z.ZodNull) return "null";
  if (schema instanceof z.ZodVoid) return "void";
  if (schema instanceof z.ZodAny) return "any";
  if (schema instanceof z.ZodUnknown) return "unknown";
  if (schema instanceof z.ZodNever) return "never";
  if (schema instanceof z.ZodBigInt) return "bigint";
  if (schema instanceof z.ZodSymbol) return "symbol";

  // Literal
  if (schema instanceof z.ZodLiteral) {
    const val = schema.value;
    return typeof val === "string" ? `"${val}"` : String(val);
  }

  // Enum
  if (schema instanceof z.ZodEnum) {
    return (schema.options as string[]).map((v: string) => `"${v}"`).join(" | ");
  }

  // Native Enum (removed in Zod 4, guard for compat)
  if ("ZodNativeEnum" in z && schema instanceof (z as any).ZodNativeEnum) {
    return "number | string";
  }

  // Array
  if (schema instanceof z.ZodArray) {
    const inner = zodTypeToTS(schema.element, indent, includeDesc);
    return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
  }

  // Tuple
  if (schema instanceof z.ZodTuple) {
    const items = ((schema as any).items ?? schema._def.items ?? [] as z.ZodTypeAny[]).map((i: z.ZodTypeAny) => zodTypeToTS(i, indent, includeDesc));
    return `[${items.join(", ")}]`;
  }

  // Record
  if (schema instanceof z.ZodRecord) {
    const valType = zodTypeToTS(schema._def.valueType ?? (schema as any).valueSchema, indent, includeDesc);
    return `Record<string, ${valType}>`;
  }

  // Map
  if (schema instanceof z.ZodMap) {
    return `Map<${zodTypeToTS(schema._def.keyType, indent, includeDesc)}, ${zodTypeToTS(schema._def.valueType, indent, includeDesc)}>`;
  }

  // Set
  if (schema instanceof z.ZodSet) {
    return `Set<${zodTypeToTS(schema._def.valueType, indent, includeDesc)}>`;
  }

  // Union
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    const opts = (schema.options as z.ZodTypeAny[]).map((o) => zodTypeToTS(o, indent, includeDesc));
    return opts.join(" | ");
  }

  // Intersection
  if (schema instanceof z.ZodIntersection) {
    const left = zodTypeToTS(schema._def.left, indent, includeDesc);
    const right = zodTypeToTS(schema._def.right, indent, includeDesc);
    return `${left} & ${right}`;
  }

  // Object (inline)
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const fields = Object.entries(shape).map(([key, field]) => {
      const optional = field.isOptional();
      const typeStr = zodTypeToTS(field, indent, includeDesc);
      return `${key}${optional ? "?" : ""}: ${typeStr}`;
    });
    return `{ ${fields.join("; ")} }`;
  }

  // Promise
  if (schema instanceof z.ZodPromise) {
    return `Promise<${zodTypeToTS(schema._def.type, indent, includeDesc)}>`;
  }

  // Function
  if (schema instanceof z.ZodFunction) {
    return `(...args: any[]) => any`;
  }

  // Lazy
  if (schema instanceof z.ZodLazy) {
    return zodTypeToTS(schema.schema, indent, includeDesc);
  }

  // Effects (refinements, transforms — removed in Zod 4)
  if ("ZodEffects" in z && schema instanceof (z as any).ZodEffects) {
    return zodTypeToTS((schema as any).innerType(), indent, includeDesc);
  }

  // Branded (removed in Zod 4)
  if ("ZodBranded" in z && schema instanceof (z as any).ZodBranded) {
    return zodTypeToTS((schema as any).unwrap(), indent, includeDesc);
  }

  // Pipeline (removed in Zod 4)
  if ("ZodPipeline" in z && schema instanceof (z as any).ZodPipeline) {
    return zodTypeToTS((schema as any)._def.out, indent, includeDesc);
  }

  return "unknown";
}

/**
 * Generate TypeScript declarations for multiple schemas.
 */
export function generateTypes(
  schemas: Record<string, z.ZodTypeAny>,
  options: TypeBuilderOptions = {},
): string {
  return Object.entries(schemas)
    .map(([name, schema]) => zodToTypeScript(name, schema, options))
    .join("\n\n");
}
