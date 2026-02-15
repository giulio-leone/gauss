// =============================================================================
// ZodValidationAdapter — Zod-based implementation of ValidationPort
// =============================================================================

import { type ZodType } from "zod";
import type { ValidationPort, ValidationResult } from "../../ports/validation.port.js";

export class ZodValidationAdapter implements ValidationPort {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T> {
    const zodSchema = schema as ZodType<T>;
    const result = zodSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data as T };
    }
    return { success: false, error: result.error.message };
  }

  validateOrThrow<T>(schema: unknown, data: unknown): T {
    const zodSchema = schema as ZodType<T>;
    return zodSchema.parse(data) as T;
  }
}
