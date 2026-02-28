---
sidebar_position: 1
title: GuardrailsPlugin
description: Input/output validation, content filtering, and PII detection
---

# GuardrailsPlugin

The `GuardrailsPlugin` validates agent inputs and outputs using Zod schemas, applies content filters, and can detect PII patterns.

## Quick Start

```typescript
import { Agent, createGuardrailsPlugin, createPiiFilter } from "gauss";
import { z } from "zod";

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You are a helpful assistant.",
})
  .use(createGuardrailsPlugin({
    inputSchema: z.string().min(1).max(10000),
    outputSchema: z.string().max(50000),
    contentFilters: [createPiiFilter()],
    toolSchemas: {
      write_file: z.object({
        path: z.string(),
        content: z.string().max(100000),
      }),
    },
    onFailure: "throw",
  }))
  .build();
```

## Configuration

```typescript
interface GuardrailsPluginOptions {
  inputSchema?: ZodType;                         // Validate the input prompt
  outputSchema?: ZodType;                        // Validate the output text
  toolSchemas?: Record<string, ZodType>;          // Per-tool argument validation
  contentFilters?: ContentFilter[];               // Content filters for input/output
  inputValidators?: Array<(prompt: string) => string | null>;  // Custom input validators
  outputValidators?: Array<(output: string) => string | null>; // Custom output validators
  onFailure?: "throw" | "warn";                  // Action on failure (default: "throw")
  validator?: ValidationPort;                     // Custom validation adapter
}
```

## Content Filters

Content filters test strings against patterns:

```typescript
interface ContentFilter {
  readonly name: string;
  test(content: string): boolean;
}
```

### Built-in: PII Filter

Detects email addresses, SSNs, and credit card numbers:

```typescript
import { createPiiFilter } from "gauss";

const piiFilter = createPiiFilter();
piiFilter.test("user@example.com"); // true
piiFilter.test("Hello world");      // false
```

### Custom Content Filter

```typescript
const profanityFilter: ContentFilter = {
  name: "profanity",
  test(content: string): boolean {
    const banned = ["badword1", "badword2"];
    return banned.some((w) => content.toLowerCase().includes(w));
  },
};
```

## Custom Validators

Return `null` for valid input, or an error message string:

```typescript
const agent = Agent.create({ model, instructions: "..." })
  .use(createGuardrailsPlugin({
    inputValidators: [
      (prompt) => prompt.length < 5 ? "Prompt too short" : null,
    ],
    outputValidators: [
      (output) => output.includes("TODO") ? "Output contains incomplete work" : null,
    ],
  }))
  .build();
```

## Error Handling

When `onFailure: "throw"` (default), a `GuardrailsError` is thrown:

```typescript
import { GuardrailsError } from "gauss";

try {
  await agent.run(prompt);
} catch (error) {
  if (error instanceof GuardrailsError) {
    console.log(error.code); // "input_validation" | "output_validation" | "content_filter" | "tool_validation"
    console.log(error.message);
  }
}
```

## Hooks Used

| Hook | Purpose |
|------|---------|
| `beforeRun` | Validates input prompt against schema, content filters, and custom validators |
| `afterRun` | Validates output text against schema, content filters, and custom validators |
| `beforeTool` | Validates tool arguments against per-tool schemas |
