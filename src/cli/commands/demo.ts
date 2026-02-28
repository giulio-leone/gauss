// =============================================================================
// CLI Demo Command — Showcase plugins and graph
// =============================================================================

import type { LanguageModel } from "../../core/llm/index.js";
import { color } from "../format.js";

/** Max characters shown for response previews in demo output */
const MAX_RESPONSE_PREVIEW_LENGTH = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Guardrails Demo
// ─────────────────────────────────────────────────────────────────────────────

export async function demoGuardrails(model: LanguageModel): Promise<void> {
  const { Agent } = await import("../../agent/agent.js");
  const { GuardrailsPlugin, createPiiFilter } = await import("../../plugins/index.js");

  console.log(color("magenta", "\n═══ Guardrails Plugin Demo ═══\n"));
  console.log("This demo shows input/output validation with content filtering.\n");

  const plugin = new GuardrailsPlugin({
    contentFilters: [createPiiFilter()],
    inputValidators: [
      (prompt) =>
        prompt.length < 3 ? "Prompt must be at least 3 characters" : null,
    ],
    onFailure: "warn",
  });

  const agent = Agent.create({
    model,
    instructions: "You are a helpful assistant.",
  })
    .withPlugin(plugin)
    .build();

  try {
    // Test 1: Valid input
    console.log(color("yellow", "▸ Test 1: Valid input"));
    console.log('  Prompt: "What is TypeScript?"');
    const result1 = await agent.run("What is TypeScript?");
    console.log(color("green", `  ✓ Response: ${result1.text.slice(0, 120)}...\n`));

    // Test 2: Short input (triggers validation warning)
    console.log(color("yellow", "▸ Test 2: Short input (triggers validator)"));
    console.log('  Prompt: "Hi"');
    const result2 = await agent.run("Hi");
    console.log(color("green", `  ✓ Response: ${result2.text.slice(0, 120)}...\n`));

    // Test 3: PII input (triggers content filter warning)
    console.log(color("yellow", "▸ Test 3: PII content (triggers filter)"));
    console.log('  Prompt: "My email is test@example.com"');
    const result3 = await agent.run("My email is test@example.com");
    console.log(color("green", `  ✓ Response: ${result3.text.slice(0, 120)}...\n`));
  } finally {
    await agent.dispose();
  }

  console.log(color("magenta", "═══ Demo complete ═══\n"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Demo
// ─────────────────────────────────────────────────────────────────────────────

export async function demoWorkflow(model: LanguageModel): Promise<void> {
  const { Agent } = await import("../../agent/agent.js");
  const { WorkflowPlugin } = await import("../../plugins/index.js");

  console.log(color("magenta", "\n═══ Workflow Plugin Demo ═══\n"));
  console.log("This demo executes a 3-step workflow before the agent runs.\n");

  const plugin = new WorkflowPlugin({
    steps: [
      {
        id: "validate-env",
        name: "Validate environment",
        execute: async (ctx) => {
          console.log(color("cyan", "  ⚙ Step 1: Validating environment..."));
          return { ...ctx, envValid: true, timestamp: Date.now() };
        },
      },
      {
        id: "fetch-context",
        name: "Fetch context",
        execute: async (ctx) => {
          console.log(color("cyan", "  ⚙ Step 2: Fetching context..."));
          return { ...ctx, context: "user prefers concise answers" };
        },
      },
      {
        id: "prepare-prompt",
        name: "Prepare prompt",
        execute: async (ctx) => {
          console.log(color("cyan", "  ⚙ Step 3: Preparing prompt..."));
          return { ...ctx, ready: true };
        },
      },
    ],
  });

  const agent = Agent.create({
    model,
    instructions: "You are a helpful assistant.",
  })
    .withPlugin(plugin)
    .build();

  try {
    console.log(color("yellow", "▸ Running workflow + agent..."));
    const result = await agent.run("Explain what a workflow engine is in 2 sentences.");
    console.log(color("green", `\n  ✓ Response: ${result.text.slice(0, MAX_RESPONSE_PREVIEW_LENGTH)}\n`));

    const wfResult = plugin.getLastResult();
    if (wfResult) {
      console.log(color("cyan", `  Steps completed: ${wfResult.completedSteps.join(", ")}`));
      console.log(color("cyan", `  Duration: ${wfResult.totalDurationMs}ms`));
      console.log(color("cyan", `  Status: ${wfResult.status}\n`));
    }
  } finally {
    await agent.dispose();
  }

  console.log(color("magenta", "═══ Demo complete ═══\n"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph Demo
// ─────────────────────────────────────────────────────────────────────────────

export async function demoGraph(model: LanguageModel): Promise<void> {
  const { AgentGraph } = await import("../../graph/agent-graph.js");

  console.log(color("magenta", "\n═══ Agent Graph Demo ═══\n"));
  console.log("This demo runs a 3-node agent graph for multi-agent collaboration.\n");
  console.log("  [researcher] → [writer] → [reviewer]\n");

  const graph = AgentGraph.create()
    .node("researcher", {
      model,
      instructions:
        "You are a researcher. Provide key facts and data points about the topic. Be concise — 3-4 bullet points max.",
    })
    .node("writer", {
      model,
      instructions:
        "You are a writer. Using the research provided, write a clear 2-paragraph summary.",
    })
    .node("reviewer", {
      model,
      instructions:
        "You are an editor. Review the text for clarity, accuracy, and conciseness. Provide your final improved version.",
    })
    .edge("researcher", "writer")
    .edge("writer", "reviewer")
    .build();

  console.log(color("yellow", "▸ Running graph with prompt: \"Explain WebAssembly\"\n"));

  for await (const event of graph.stream("Explain WebAssembly")) {
    switch (event.type) {
      case "node:start":
        process.stdout.write(color("cyan", `  ▸ Node "${event.nodeId}" started...\n`));
        break;
      case "node:complete":
        console.log(color("green", `  ✓ Node "${event.nodeId}" completed`));
        if (event.result) {
          const preview = event.result.output.slice(0, 150).replace(/\n/g, " ");
          console.log(color("dim", `    "${preview}..."\n`));
        }
        break;
      case "graph:complete":
        console.log(color("green", `  ✓ Graph complete in ${event.result?.totalDurationMs}ms`));
        console.log(color("cyan", "\n  ── Final Output ──\n"));
        console.log(`  ${event.result?.output}\n`);
        break;
      case "graph:error":
        console.log(color("red", `  ✗ Graph error: ${event.error}\n`));
        break;
    }
  }

  console.log(color("magenta", "═══ Demo complete ═══\n"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability Demo
// ─────────────────────────────────────────────────────────────────────────────

export async function demoObservability(model: LanguageModel): Promise<void> {
  const { Agent } = await import("../../agent/agent.js");
  const { ObservabilityPlugin } = await import("../../plugins/index.js");
  const { InMemoryTracingAdapter } = await import("../../adapters/tracing/index.js");
  const { InMemoryMetricsAdapter } = await import("../../adapters/metrics/index.js");
  const { ConsoleLoggingAdapter } = await import("../../adapters/logging/index.js");

  console.log(color("magenta", "\n═══ Observability Plugin Demo ═══\n"));
  console.log("This demo shows tracing, metrics, and logging.\n");

  const tracer = new InMemoryTracingAdapter();
  const metrics = new InMemoryMetricsAdapter();
  const logger = new ConsoleLoggingAdapter();

  const plugin = new ObservabilityPlugin({ tracer, metrics, logger });

  const agent = Agent.create({
    model,
    instructions: "You are a helpful assistant. Answer briefly.",
  })
    .withPlugin(plugin)
    .build();

  try {
    console.log(color("yellow", "▸ Running agent with observability...\n"));
    const result = await agent.run("What is 2 + 2?");
    console.log(color("green", `\n  ✓ Response: ${result.text}\n`));

    console.log(color("cyan", "  ── Collected Metrics ──"));
    const metricNames = ["agent.runs.total", "agent.runs.success", "agent.runs.errors"];
    for (const name of metricNames) {
      const value = metrics.getCounter(name);
      if (value > 0) console.log(color("dim", `    ${name}: ${value}`));
    }

    console.log(color("cyan", "\n  ── Trace Spans ──"));
    const spans = tracer.getSpans();
    for (const span of spans) {
      console.log(color("dim", `    ${span.name} [${span.status}]`));
    }
    console.log();
  } finally {
    await agent.dispose();
  }

  console.log(color("magenta", "═══ Demo complete ═══\n"));
}
