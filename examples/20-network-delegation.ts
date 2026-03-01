// =============================================================================
// 20 — Network with supervisor-based delegation
// =============================================================================
//
// The Network class enables dynamic multi-agent delegation. A supervisor agent
// routes tasks to the best-suited agent at runtime. All routing logic runs
// in Rust core.
//
// Usage: npx tsx examples/20-network-delegation.ts

import { Agent, Network } from "gauss-ts";

async function main(): Promise<void> {
  // ── Create domain agents ───────────────────────────────────────────
  const coder = new Agent({
    name: "coder",
    instructions: "You write high-quality code. Always include type annotations.",
  });

  const reviewer = new Agent({
    name: "reviewer",
    instructions: "You review code for bugs, security issues, and best practices.",
  });

  const documenter = new Agent({
    name: "documenter",
    instructions: "You write clear API documentation and usage examples.",
  });

  const supervisor = new Agent({
    name: "supervisor",
    instructions: "You coordinate work between coder, reviewer, and documenter.",
  });

  // ── Build the network ──────────────────────────────────────────────
  const network = new Network()
    .addAgent(coder, "Writes TypeScript/Rust code")
    .addAgent(reviewer, "Reviews code for quality")
    .addAgent(documenter, "Writes documentation")
    .addAgent(supervisor, "Routes tasks to the best agent")
    .setSupervisor("supervisor");

  // ── Inspect agent cards ────────────────────────────────────────────
  const cards = network.agentCards();
  console.log("Network agents:", JSON.stringify(cards, null, 2));

  // ── Delegate tasks ─────────────────────────────────────────────────
  console.log("\n--- Delegation: supervisor → coder ---");
  const codeResult = await network.delegate(
    "supervisor",
    "coder",
    "Write a TypeScript function that validates email addresses using a regex.",
  );
  console.log("Code result:", JSON.stringify(codeResult).slice(0, 300));

  console.log("\n--- Delegation: supervisor → reviewer ---");
  const reviewResult = await network.delegate(
    "supervisor",
    "reviewer",
    "Review this code: function validate(email: string) { return /^[^@]+@[^@]+$/.test(email); }",
  );
  console.log("Review result:", JSON.stringify(reviewResult).slice(0, 300));

  console.log("\n--- Delegation: supervisor → documenter ---");
  const docResult = await network.delegate(
    "supervisor",
    "documenter",
    "Write API docs for a validate(email: string): boolean function.",
  );
  console.log("Doc result:", JSON.stringify(docResult).slice(0, 300));

  // ── Cleanup ────────────────────────────────────────────────────────
  network.destroy();
  coder.destroy();
  reviewer.destroy();
  documenter.destroy();
  supervisor.destroy();
}

main().catch(console.error);
