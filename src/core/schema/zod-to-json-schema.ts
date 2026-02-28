// =============================================================================
// Zod → JSON Schema converter
// Supports Zod v4 (uses built-in toJSONSchema) with v3 fallback.
// =============================================================================

type JsonSchema = Record<string, unknown>;

// Zod v4 schema interface
interface ZodV4Like {
  toJSONSchema?: () => JsonSchema;
  _def?: {
    type?: string;          // v4: "string", "number", "object", etc.
    typeName?: string;      // v3: "ZodString", "ZodNumber", etc.
    description?: string;   // v3 only
    shape?: Record<string, ZodV4Like>;
    element?: ZodV4Like;    // v4 array
    innerType?: ZodV4Like;  // v4 optional/nullable/default
    options?: ZodV4Like[];  // v4/v3 union
    entries?: Record<string, string>; // v4 enum
    values?: unknown[];     // v3 enum / v4 literal
    value?: unknown;        // v3 literal
    keyType?: ZodV4Like;    // v4 record
    valueType?: ZodV4Like;  // v4 record
    left?: ZodV4Like;       // v3 intersection
    right?: ZodV4Like;      // v3 intersection
    items?: ZodV4Like[];    // v3 tuple
    schema?: ZodV4Like;     // v3 lazy/effects
    getter?: () => ZodV4Like; // v3 lazy
    checks?: Array<{ kind: string; value?: unknown }>;
  };
  shape?: unknown;
  description?: string;     // v4: property on schema
  isOptional?: () => boolean;
}

// ---------------------------------------------------------------------------
// v3 fallback — manual introspection
// ---------------------------------------------------------------------------

function resolveChecks(def: ZodV4Like["_def"]): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (!def?.checks) return c;
  for (const ck of def.checks) {
    switch (ck.kind) {
      case "min": c.minimum = ck.value; break;
      case "max": c.maximum = ck.value; break;
      case "length": c.minLength = ck.value; c.maxLength = ck.value; break;
      case "email": case "url": case "uuid": case "cuid": c.format = ck.kind; break;
      case "regex": c.pattern = String(ck.value); break;
    }
  }
  return c;
}

function v3Convert(schema: ZodV4Like): JsonSchema {
  if (!schema?._def) return {};
  const tn = schema._def.typeName;
  const desc = schema._def.description;
  const base: JsonSchema = desc ? { description: desc } : {};

  switch (tn) {
    case "ZodString": return { ...base, type: "string", ...resolveChecks(schema._def) };
    case "ZodNumber": case "ZodBigInt": return { ...base, type: "number", ...resolveChecks(schema._def) };
    case "ZodBoolean": return { ...base, type: "boolean" };
    case "ZodDate": return { ...base, type: "string", format: "date-time" };
    case "ZodNull": return { ...base, type: "null" };
    case "ZodAny": case "ZodUnknown": return { ...base };
    case "ZodUndefined": case "ZodVoid": case "ZodNever": return { ...base, not: {} };

    case "ZodLiteral": {
      const v = schema._def.value;
      const t = typeof v === "string" ? "string" : typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : undefined;
      return { ...base, ...(t ? { type: t } : {}), const: v };
    }
    case "ZodEnum": case "ZodNativeEnum":
      return { ...base, type: "string", enum: schema._def.values };

    case "ZodObject": {
      const raw = schema.shape ?? schema._def.shape;
      const shape = typeof raw === "function" ? (raw as () => Record<string, ZodV4Like>)() : raw as Record<string, ZodV4Like> | undefined;
      if (!shape) return { ...base, type: "object" };
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = v3Convert(val);
        if (typeof val.isOptional !== "function" || !val.isOptional()) required.push(key);
      }
      return { ...base, type: "object", properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false };
    }
    case "ZodArray": {
      const item = schema._def.type as unknown as ZodV4Like | undefined;
      return { ...base, type: "array", ...(item ? { items: v3Convert(item) } : {}) };
    }
    case "ZodTuple": {
      const items = schema._def.items ?? [];
      return { ...base, type: "array", prefixItems: items.map((i: ZodV4Like) => v3Convert(i)), minItems: items.length, maxItems: items.length };
    }
    case "ZodRecord": case "ZodMap": {
      const vt = schema._def.valueType;
      return { ...base, type: "object", ...(vt ? { additionalProperties: v3Convert(vt) } : {}) };
    }
    case "ZodUnion": case "ZodDiscriminatedUnion": {
      const opts = schema._def.options ?? [];
      return { ...base, anyOf: opts.map((o: ZodV4Like) => v3Convert(o)) };
    }
    case "ZodIntersection": {
      const parts: JsonSchema[] = [];
      if (schema._def.left) parts.push(v3Convert(schema._def.left));
      if (schema._def.right) parts.push(v3Convert(schema._def.right));
      return { ...base, allOf: parts };
    }
    case "ZodOptional": {
      const inner = schema._def.innerType ?? schema._def.type;
      return inner ? v3Convert(inner as ZodV4Like) : {};
    }
    case "ZodNullable": {
      const inner = schema._def.innerType ?? schema._def.type;
      if (!inner) return { type: "null" };
      const is = v3Convert(inner as ZodV4Like);
      return is.type ? { ...is, type: [is.type, "null"] } : { anyOf: [is, { type: "null" }] };
    }
    case "ZodDefault": case "ZodCatch": case "ZodReadonly": case "ZodBranded": {
      const inner = schema._def.innerType ?? schema._def.type;
      return inner ? v3Convert(inner as ZodV4Like) : {};
    }
    case "ZodLazy": {
      const resolved = schema._def.getter?.() ?? schema._def.schema;
      return resolved ? v3Convert(resolved as ZodV4Like) : {};
    }
    case "ZodEffects": {
      const inner = schema._def.schema ?? schema._def.type;
      return inner ? v3Convert(inner as ZodV4Like) : {};
    }
    default: return { ...base, type: "object" };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Zod schema to JSON Schema.
 * Uses Zod v4's built-in `toJSONSchema()` when available,
 * falls back to manual introspection for Zod v3.
 */
export function zodToJsonSchema(schema: unknown): JsonSchema {
  if (!schema) return {};
  const s = schema as ZodV4Like;

  // Zod v4: use built-in conversion (strips $schema key for cleaner output)
  if (typeof s.toJSONSchema === "function") {
    try {
      const result = s.toJSONSchema();
      const { $schema: _, ...rest } = result;
      return rest;
    } catch {
      // Fall through to manual conversion
    }
  }

  // Zod v3 fallback
  return v3Convert(s);
}

/**
 * Validate data against a Zod schema. Returns structured result.
 * Used for validating LLM structured output against declared output schema.
 */
export function validateWithZod<T = unknown>(
  schema: unknown,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  if (!schema) return { success: true, data: data as T };
  const s = schema as { safeParse?: (d: unknown) => { success: boolean; data?: T; error?: { message: string } } };
  if (typeof s.safeParse !== "function") return { success: true, data: data as T };
  const result = s.safeParse(data);
  if (result.success) return { success: true, data: result.data as T };
  return { success: false, error: result.error?.message ?? "Validation failed" };
}
