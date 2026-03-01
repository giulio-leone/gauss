// =============================================================================
// 07 — Plugin System with PluginRegistry
// =============================================================================
//
// The PluginRegistry provides an event-driven plugin system backed by Rust.
// Built-in plugins include telemetry and memory. Custom events can be emitted.
//
// Usage: npx tsx examples/07-plugin-system.ts

import { PluginRegistry } from "gauss-ts";

async function main(): Promise<void> {
  const registry = new PluginRegistry();

  // ── Register built-in plugins ──────────────────────────────────────
  registry.addTelemetry(); // Auto-records spans and metrics
  registry.addMemory();    // Auto-stores conversation context

  // List active plugins
  console.log("Active plugins:", registry.list());

  // ── Emit custom events ─────────────────────────────────────────────
  // Plugins can react to any event type via the Rust event bus
  registry.emit({
    type: "agent:start",
    agentName: "my-agent",
    timestamp: new Date().toISOString(),
  });

  registry.emit({
    type: "tool:call",
    toolName: "search",
    arguments: { query: "Rust NAPI" },
  });

  registry.emit({
    type: "agent:complete",
    agentName: "my-agent",
    tokensUsed: 1234,
    durationMs: 4500,
  });

  console.log("Events emitted successfully.");

  registry.destroy();
}

main().catch(console.error);
