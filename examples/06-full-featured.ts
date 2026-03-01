// =============================================================================
// 06 — Full-featured pipeline: Agent + Memory + Middleware + Guardrails + Telemetry
// =============================================================================
//
// Combines all major SDK components into a single observable, safe pipeline.
//
// Usage: npx tsx examples/06-full-featured.ts

import {
  Agent,
  Memory,
  MiddlewareChain,
  GuardrailChain,
  Telemetry,
} from "gauss-ai";

async function main(): Promise<void> {
  // ── Middleware: logging + caching ───────────────────────────────────
  const middleware = new MiddlewareChain()
    .useLogging()
    .useCaching(60_000); // 60s TTL

  // ── Guardrails: content safety ─────────────────────────────────────
  const guardrails = new GuardrailChain()
    .addContentModeration(["password", "secret"], ["internal"])
    .addPiiDetection("redact")
    .addTokenLimit(4000, 2000)
    .addRegexFilter(["\\b(?:DROP|DELETE)\\s+TABLE\\b"], []);

  console.log("Active guardrails:", guardrails.list());

  // ── Telemetry: spans + metrics ─────────────────────────────────────
  const telemetry = new Telemetry();

  // ── Memory: conversation history ───────────────────────────────────
  const memory = new Memory();
  await memory.store({
    id: "ctx-1",
    content: "User is building a Node.js microservice.",
    entryType: "fact",
    timestamp: new Date().toISOString(),
  });

  // ── Agent ──────────────────────────────────────────────────────────
  const agent = new Agent({
    name: "full-pipeline",
    provider: "openai",
    model: "gpt-4o",
    instructions: "You are a senior engineer. Be precise and security-conscious.",
    temperature: 0.3,
    maxSteps: 10,
  });

  // Record a span around the agent call
  const start = Date.now();
  const result = await agent.run("Design a rate-limiting middleware for Express.js");
  const duration = Date.now() - start;

  telemetry.recordSpan("agent.run", duration, {
    agent: "full-pipeline",
    tokens: result.inputTokens + result.outputTokens,
  });

  // Store the conversation
  await memory.store({
    id: "msg-1",
    content: result.text,
    entryType: "conversation",
    timestamp: new Date().toISOString(),
  });

  console.log("Response:", result.text.slice(0, 200), "...");
  console.log("Spans:", telemetry.exportSpans());
  console.log("Metrics:", telemetry.exportMetrics());
  console.log("Memory stats:", await memory.stats());

  // ── Cleanup ────────────────────────────────────────────────────────
  agent.destroy();
  memory.destroy();
  middleware.destroy();
  guardrails.destroy();
  telemetry.destroy();
}

main().catch(console.error);
