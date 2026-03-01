/**
 * Structured Output — validate and extract typed JSON from LLM responses.
 *
 * @example
 *   import { structured, zodSchema } from "gauss-ts";
 *
 *   const result = await structured(agent, "List 3 fruits", {
 *     schema: { type: "object", properties: { fruits: { type: "array", items: { type: "string" } } } },
 *   });
 *   console.log(result.data.fruits); // ["apple", "banana", "cherry"]
 */

import type { Agent } from "./agent.js";
import type { AgentResult, Message } from "./types.js";

// ─── Types ─────────────────────────────────────────────────────────

/** JSON Schema subset for structured output. */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  [key: string]: unknown;
}

export interface StructuredConfig {
  /** JSON schema the output must conform to. */
  schema: JsonSchema;
  /** Maximum parse retries if the model returns invalid JSON (default: 2). */
  maxParseRetries?: number;
  /** If true, include the raw AgentResult alongside parsed data. */
  includeRaw?: boolean;
}

export interface StructuredResult<T = unknown> {
  /** Parsed and validated data. */
  data: T;
  /** Raw agent result (only if includeRaw was true). */
  raw?: AgentResult;
}

// ─── Implementation ────────────────────────────────────────────────

function buildStructuredPrompt(userPrompt: string, schema: JsonSchema): string {
  const schemaStr = JSON.stringify(schema, null, 2);
  return `${userPrompt}\n\nRespond ONLY with valid JSON matching this schema:\n${schemaStr}\n\nDo not include any text outside the JSON object.`;
}

function extractJson(text: string): string {
  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find first { or [
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");

  if (objStart === -1 && arrStart === -1) return text.trim();

  const start = objStart === -1 ? arrStart
    : arrStart === -1 ? objStart
    : Math.min(objStart, arrStart);

  const isArray = text[start] === "[";
  const closer = isArray ? "]" : "}";

  // Find matching closer by counting nesting
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === text[start]) depth++;
    if (ch === closer) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start);
}

/**
 * Run an agent with structured output extraction.
 *
 * Automatically instructs the model to output JSON matching the schema,
 * extracts and parses the JSON from the response, and retries on parse failure.
 *
 * @example
 *   const { data } = await structured(agent, "List 3 programming languages", {
 *     schema: {
 *       type: "object",
 *       properties: {
 *         languages: { type: "array", items: { type: "string" } }
 *       },
 *       required: ["languages"]
 *     }
 *   });
 *   console.log(data.languages);
 */
export async function structured<T = unknown>(
  agent: Agent,
  prompt: string | Message[],
  config: StructuredConfig
): Promise<StructuredResult<T>> {
  const maxParseRetries = config.maxParseRetries ?? 2;
  const schemaPrompt = typeof prompt === "string"
    ? buildStructuredPrompt(prompt, config.schema)
    : prompt;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxParseRetries; attempt++) {
    const input = attempt === 0
      ? schemaPrompt
      : typeof schemaPrompt === "string"
        ? `${schemaPrompt}\n\nPrevious attempt failed: ${lastError?.message}. Please output ONLY valid JSON.`
        : schemaPrompt;

    const result = await agent.run(input);

    try {
      const jsonStr = extractJson(result.text);
      const data = JSON.parse(jsonStr) as T;
      return {
        data,
        raw: config.includeRaw ? result : undefined,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Failed to extract structured output after ${maxParseRetries + 1} attempts: ${lastError?.message}`
  );
}
