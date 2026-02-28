// =============================================================================
// Template: Chat Agent — Minimal conversational AI
// =============================================================================
// gauss init --template chat
//
// A simple chat agent with streaming, memory, and tool calling.
// =============================================================================

import { agent } from "gauss";
import { openai } from "gauss/providers";

const chatAgent = agent({
  model: openai("gpt-5.2-mini"),
  instructions: `You are a helpful assistant. Be concise and friendly.`,
}).build();

// Simple chat loop
const sessionId = "user-session-1";

async function chat(message: string) {
  const result = await chatAgent.run(message, { sessionId });
  console.log(`Assistant: ${result.text}`);
  return result.text;
}

// Example usage
await chat("Hello! What can you do?");
await chat("Tell me a fun fact about mathematics");
