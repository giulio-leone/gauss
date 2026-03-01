// =============================================================================
// 08 — A2A (Agent-to-Agent) Protocol Client
// =============================================================================
//
// Demonstrates the A2A client for communicating with A2A-compliant agents
// over HTTP using JSON-RPC 2.0.
//
// Prerequisite: an A2A-compliant server running (e.g., on port 8080).
// Usage: npx tsx examples/08-a2a-server.ts

import {
  A2aClient,
  userMessage,
  extractText,
  taskText,
} from "gauss-ai";

async function main(): Promise<void> {
  const baseUrl = process.env.A2A_SERVER_URL ?? "http://localhost:8080";
  const client = new A2aClient({ baseUrl });

  // ── 1. Discover agent capabilities ─────────────────────────────────
  try {
    const card = await client.discover();
    console.log("Agent:", card.name);
    console.log("Skills:", card.skills?.map((s) => s.name));
    console.log("Capabilities:", card.capabilities);
  } catch (err) {
    console.log("Discovery failed (is the A2A server running?):", (err as Error).message);
    console.log("Showing API usage patterns instead:\n");
  }

  // ── 2. Quick ask (text in → text out) ──────────────────────────────
  // const answer = await client.ask("Summarize the latest project status.");
  // console.log("Answer:", answer);

  // ── 3. Full message exchange ───────────────────────────────────────
  // const result = await client.sendMessage(userMessage("What tasks are pending?"));
  // if (result.type === "task") {
  //   console.log("Task ID:", result.task.id);
  //   console.log("Status:", result.task.status.state);
  //   console.log("Text:", taskText(result.task));
  // } else {
  //   console.log("Response:", extractText(result.message));
  // }

  // ── 4. Task lifecycle ──────────────────────────────────────────────
  // const task = await client.getTask("task-123");
  // console.log("Task state:", task.status.state);
  // await client.cancelTask("task-123");

  // ── Helper demos (no server needed) ────────────────────────────────
  const msg = userMessage("Hello from Gauss!");
  console.log("User message:", msg);
  console.log("Extracted text:", extractText(msg));
}

main().catch(console.error);
