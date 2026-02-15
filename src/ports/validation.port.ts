// =============================================================================
// ValidationPort — Validation-engine agnostic contract
// =============================================================================

export interface ValidationResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export interface ValidationPort {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T>;
  validateOrThrow<T>(schema: unknown, data: unknown): T;
}
