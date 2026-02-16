// =============================================================================
// Default Partial JSON Adapter — Incremental JSON parsing without dependencies
// =============================================================================

import type {
  PartialJsonPort,
  JsonAccumulator,
} from "../../ports/partial-json.port.js";

/**
 * Attempt to complete an incomplete JSON string by closing unclosed
 * brackets, braces, and strings, and removing trailing commas.
 */
function completePartialJson(partial: string): string {
  let s = partial.trimEnd();
  if (s.length === 0) return s;

  // Track whether we are inside a string and the nesting stack
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // Close unclosed string — strip a dangling backslash so the added
  // closing quote isn't interpreted as an escaped quote (R1 fix).
  if (inString) {
    if (escaped) {
      s = s.slice(0, -1);
    }
    s += '"';
  }

  // Remove trailing commas (invalid JSON) before closing brackets
  s = s.replace(/,\s*$/, "");

  // Close unclosed brackets / braces
  while (stack.length > 0) {
    s += stack.pop();
  }

  return s;
}

/**
 * Parse an incomplete JSON string, returning whatever is parseable so far.
 */
function parsePartialJson(partial: string): { value: unknown; complete: boolean } {
  const trimmed = partial.trim();
  if (trimmed.length === 0) {
    return { value: undefined, complete: false };
  }

  // Try parsing the original string first (complete JSON)
  try {
    const value = JSON.parse(trimmed);
    return { value, complete: true };
  } catch {
    // Not complete — try to repair
  }

  // Attempt to complete the partial JSON and parse
  const completed = completePartialJson(trimmed);
  try {
    const value = JSON.parse(completed);
    return { value, complete: false };
  } catch {
    return { value: undefined, complete: false };
  }
}

/**
 * Create a JsonAccumulator that buffers incoming chunks and
 * incrementally parses the accumulated JSON.
 */
function createJsonAccumulator<T>(): JsonAccumulator<T> {
  let buffer = "";
  let lastParsed: Partial<T> | null = null;
  let complete = false;

  return {
    push(chunk: string): void {
      buffer += chunk;
      const result = parsePartialJson(buffer);
      if (result.value !== undefined) {
        lastParsed = result.value as Partial<T>;
        complete = result.complete;
      }
    },

    current(): Partial<T> | null {
      return lastParsed;
    },

    isComplete(): boolean {
      return complete;
    },

    reset(): void {
      buffer = "";
      lastParsed = null;
      complete = false;
    },
  };
}

// =============================================================================
// Adapter factory
// =============================================================================

export function createDefaultPartialJsonAdapter(): PartialJsonPort {
  return {
    parse: parsePartialJson,
    createAccumulator: createJsonAccumulator,
  };
}

export const DefaultPartialJsonAdapter = {
  create: createDefaultPartialJsonAdapter,
};
