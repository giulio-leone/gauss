// =============================================================================
// Template: Tool Calling Agent — Agent with custom tools
// =============================================================================
// gauss init --template tools
//
// Agent that can call external tools (APIs, databases, calculations).
// =============================================================================

import { agent } from "gauss";
import { openai } from "gauss/providers";
import { tool } from "ai";
import { z } from "zod";

// Define tools
const weatherTool = tool({
  description: "Get current weather for a location",
  parameters: z.object({
    city: z.string().describe("City name"),
    unit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  }),
  execute: async ({ city, unit }) => {
    // Replace with real API call
    const temp = Math.round(Math.random() * 30 + 5);
    return {
      city,
      temperature: temp,
      unit,
      condition: temp > 20 ? "sunny" : "cloudy",
    };
  },
});

const calculatorTool = tool({
  description: "Evaluate a math expression",
  parameters: z.object({
    expression: z.string().describe("Math expression to evaluate"),
  }),
  execute: async ({ expression }) => {
    // Simple eval — in production, use a safe math parser
    const result = Function(`"use strict"; return (${expression})`)();
    return { expression, result };
  },
});

// Create agent with tools
const toolAgent = agent({
  model: openai("gpt-5.2"),
  instructions: `You are a helpful assistant with access to weather and calculator tools.
Always use tools when the user asks about weather or math.`,
  tools: { weather: weatherTool, calculator: calculatorTool },
}).build();

// Run
const result = await toolAgent.run("What's the weather in Rome? And what's 42 * 17?");
console.log(result.text);
