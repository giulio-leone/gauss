---
sidebar_position: 1
title: Getting Started
description: Install GaussFlow and create your first AI agent
---

# Getting Started

GaussFlow is an AI agent framework built on [Vercel AI SDK v6](https://sdk.vercel.ai/) with hexagonal architecture, a plugin system, multi-runtime support, and multi-agent collaboration.

## Installation

```bash
pnpm add @giulio-leone/gaussflow-agent
```

GaussFlow requires `ai` (v6+) and `zod` (v4+) as direct dependencies.

### Optional Peer Dependencies

Install only the packages you need:

| Package | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Supabase-backed persistent memory |
| `tiktoken` | Accurate BPE token counting |
| `@ai-sdk/mcp` | AI SDK MCP client adapter |
| `onecrawl` | Web scraping tools (OneCrawlPlugin) |
| `@giulio-leone/gaussflow-vectorless` | RAG/knowledge extraction (VectorlessPlugin) |

```bash
pnpm add @supabase/supabase-js tiktoken
```

## Quick Start

```typescript
import { DeepAgent } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const agent = DeepAgent.minimal({
  model: openai("gpt-4o"),
  instructions: "You are a helpful coding assistant.",
});

const result = await agent.run("Create a utility function that debounces input.");

console.log(result.text);
console.log(`Steps: ${result.steps.length}`);
console.log(`Session: ${result.sessionId}`);
```

`DeepAgent.minimal()` creates an agent with a virtual filesystem and planning tools enabled, using in-memory storage and approximate token counting.

## Your First Agent with the Builder API

For more control, use the builder pattern:

```typescript
import { DeepAgent } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a project manager. Break tasks into todos.",
})
  .withPlanning()         // Enable todo management tools
  .withSubagents()        // Enable child agent spawning
  .withMaxSteps(50)       // Set max tool-loop iterations
  .build();

const result = await agent.run("Set up a REST API with user auth endpoints.");
console.log(result.text);

// Always clean up when done
await agent.dispose();
```

## Static Factory Methods

| Method | Description |
|--------|-------------|
| `DeepAgent.create(config)` | Returns a `DeepAgentBuilder` for full control |
| `DeepAgent.minimal(config)` | Planning enabled, default adapters |
| `DeepAgent.full(config)` | Planning + subagents + optional overrides |
| `DeepAgent.auto(config)` | Universal adapters, works in any runtime |

## Adding Plugins

Plugins extend agent capabilities with lifecycle hooks and tools:

```typescript
import {
  DeepAgent,
  createGuardrailsPlugin,
  createEvalsPlugin,
  createObservabilityPlugin,
  ConsoleLoggingAdapter,
} from "@giulio-leone/gaussflow-agent";
import { z } from "zod";

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant.",
})
  .use(createGuardrailsPlugin({
    inputSchema: z.string().min(1).max(10000),
    onFailure: "throw",
  }))
  .use(createObservabilityPlugin({
    logger: new ConsoleLoggingAdapter(),
  }))
  .use(createEvalsPlugin({
    onEval: (result) => console.log(`Latency: ${result.metrics.latencyMs}ms`),
  }))
  .withPlanning()
  .build();
```

## Next Steps

- [Architecture](/docs/architecture) — Understand the hexagonal architecture
- [Plugins](/docs/plugins/) — Explore built-in plugins
- [Multi-Runtime](/docs/runtime/) — Run on Node.js, Deno, Bun, Edge, or Browser
- [AgentGraph](/docs/graph/) — Multi-agent collaboration with DAG execution
