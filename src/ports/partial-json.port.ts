// =============================================================================
// Partial JSON Port — Contract for incremental JSON parsing
// =============================================================================

export interface PartialJsonPort {
  /** Parse an incomplete JSON string and return what's parseable so far */
  parse(partial: string): { value: unknown; complete: boolean };

  /** Create a streaming accumulator that yields partial objects as tokens arrive */
  createAccumulator<T>(): JsonAccumulator<T>;
}

export interface JsonAccumulator<T> {
  /** Feed a new token/chunk */
  push(chunk: string): void;

  /** Get the current partial parse result */
  current(): Partial<T> | null;

  /** Whether the JSON is complete */
  isComplete(): boolean;

  /** Reset the accumulator */
  reset(): void;
}
