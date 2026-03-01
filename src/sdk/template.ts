/**
 * Prompt Templates — composable, type-safe prompt construction.
 *
 * @example
 *   import { template, PromptTemplate } from "gauss-ai";
 *
 *   const summarize = template("Summarize the following {{format}}:\n\n{{text}}");
 *   const prompt = summarize({ format: "article", text: "Lorem ipsum..." });
 *
 *   // Composition:
 *   const withTone = template("{{base}}\n\nUse a {{tone}} tone.");
 *   const prompt = withTone({
 *     base: summarize({ format: "article", text: "..." }),
 *     tone: "professional",
 *   });
 */

// ─── Types ─────────────────────────────────────────────────────────

/** Extract variable names from a template string. */
type ExtractVars<T extends string> =
  T extends `${string}{{${infer Var}}}${infer Rest}`
    ? Var | ExtractVars<Rest>
    : never;

/** Variables object for a template. */
type TemplateVars<T extends string> = Record<ExtractVars<T>, string>;

/** A compiled prompt template function. */
export interface PromptTemplate<T extends string = string> {
  /** Render the template with variables. */
  (vars: TemplateVars<T>): string;
  /** The raw template string. */
  readonly raw: string;
  /** List of variable names in the template. */
  readonly variables: string[];
}

// ─── Implementation ────────────────────────────────────────────────

const VAR_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Create a reusable prompt template with `{{variable}}` placeholders.
 *
 * @example
 *   const t = template("Hello {{name}}, you are {{age}} years old.");
 *   t({ name: "Alice", age: "30" }); // "Hello Alice, you are 30 years old."
 *   t.variables; // ["name", "age"]
 */
export function template<T extends string>(templateStr: T): PromptTemplate<T> {
  const variables = [...new Set(
    Array.from(templateStr.matchAll(VAR_PATTERN), (m) => m[1])
  )];

  const fn = (vars: TemplateVars<T>): string => {
    return templateStr.replace(VAR_PATTERN, (_, key) => {
      const value = (vars as Record<string, string>)[key];
      if (value === undefined) {
        throw new Error(`Missing template variable: {{${key}}}`);
      }
      return value;
    });
  };

  Object.defineProperty(fn, "raw", { value: templateStr, enumerable: true });
  Object.defineProperty(fn, "variables", { value: variables, enumerable: true });

  return fn as PromptTemplate<T>;
}

// ─── Built-in templates ────────────────────────────────────────────

/** Summarization template. */
export const summarize = template(
  "Summarize the following {{format}} in {{style}}:\n\n{{text}}"
);

/** Translation template. */
export const translate = template(
  "Translate the following text to {{language}}:\n\n{{text}}"
);

/** Code review template. */
export const codeReview = template(
  "Review this {{language}} code for bugs, security issues, and best practices:\n\n```{{language}}\n{{code}}\n```"
);

/** Classification template. */
export const classify = template(
  "Classify the following text into one of these categories: {{categories}}\n\nText: {{text}}\n\nRespond with only the category name."
);

/** Extraction template. */
export const extract = template(
  "Extract the following information from the text: {{fields}}\n\nText: {{text}}\n\nRespond as JSON."
);
