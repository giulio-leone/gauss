// =============================================================================
// 21 — Structured Output with JSON schema validation
// =============================================================================
//
// The structured() function instructs the model to output JSON matching a
// given schema, then extracts and validates the response. Retries on parse
// failure.
//
// Usage: npx tsx examples/21-structured-output.ts

import { Agent, structured } from "gauss-ai";

async function main(): Promise<void> {
  const agent = new Agent({
    name: "extractor",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You extract structured data from text. Always respond with valid JSON.",
    temperature: 0,
  });

  // ── Example 1: Extract a list ──────────────────────────────────────
  const listResult = await structured(agent, "List the 5 largest planets in our solar system", {
    schema: {
      type: "object",
      properties: {
        planets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              diameterKm: { type: "number" },
            },
            required: ["name", "diameterKm"],
          },
        },
      },
      required: ["planets"],
    },
  });

  console.log("Planets:");
  const planets = listResult.data as { planets: Array<{ name: string; diameterKm: number }> };
  for (const p of planets.planets) {
    console.log(`  ${p.name}: ${p.diameterKm.toLocaleString()} km`);
  }

  // ── Example 2: Classification ──────────────────────────────────────
  const classResult = await structured(
    agent,
    "The server returned a 500 error when processing the payment request.",
    {
      schema: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["bug", "feature", "question", "docs"] },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          summary: { type: "string" },
        },
        required: ["category", "severity", "summary"],
      },
    },
  );

  console.log("\nClassification:", classResult.data);

  // ── Example 3: With raw result ─────────────────────────────────────
  const rawResult = await structured(agent, "Generate a person profile", {
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        skills: { type: "array", items: { type: "string" } },
      },
      required: ["name", "age", "skills"],
    },
    includeRaw: true,
    maxParseRetries: 3,
  });

  console.log("\nProfile:", rawResult.data);
  console.log("Tokens used:", rawResult.raw?.inputTokens, "in /", rawResult.raw?.outputTokens, "out");

  agent.destroy();
}

main().catch(console.error);
