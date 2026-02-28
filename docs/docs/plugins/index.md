---
sidebar_position: 3
title: Plugins
description: Overview of the Gauss plugin system
---

# Plugins

Plugins extend Gauss behavior through **lifecycle hooks** and **tool injection**. They are executed in registration order with deterministic hook execution.

## Plugin Interface

```typescript
interface Plugin {
  readonly name: string;
  readonly version?: string;
  readonly hooks?: PluginHooks;
  readonly tools?: Record<string, Tool>;
  setup?(ctx: PluginSetupContext): Promise<void> | void;
  dispose?(): Promise<void> | void;
}
```

## Lifecycle Hooks

| Hook | Signature | Can Modify |
|------|-----------|------------|
| `beforeRun` | `(ctx, { prompt }) → { prompt? }` | Prompt text |
| `afterRun` | `(ctx, { result }) → void` | — |
| `beforeTool` | `(ctx, { toolName, args }) → { args?, skip?, result? }` | Tool args, skip execution |
| `afterTool` | `(ctx, { toolName, args, result }) → void` | — |
| `beforeStep` | `(ctx, { stepIndex, step }) → { step?, skip? }` | Step data, skip step |
| `afterStep` | `(ctx, { stepIndex, step }) → void` | — |
| `onError` | `(ctx, { error, phase }) → { suppress? }` | Suppress error |

## Using Plugins

```typescript
import { Agent, createGuardrailsPlugin, createEvalsPlugin } from "gauss";

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You are a helpful assistant.",
})
  .use(createGuardrailsPlugin({ onFailure: "throw" }))
  .use(createEvalsPlugin())
  .build();
```

## Writing Custom Plugins

Extend `BasePlugin` for the simplest approach:

```typescript
import { BasePlugin } from "gauss";
import type { PluginHooks, PluginContext, AfterRunParams } from "gauss";

class AuditPlugin extends BasePlugin {
  readonly name = "audit";

  protected buildHooks(): PluginHooks {
    return {
      afterRun: async (ctx: PluginContext, params: AfterRunParams) => {
        console.log(`[audit] Session ${ctx.sessionId} completed`);
        console.log(`[audit] Output length: ${params.result.text.length}`);
      },
    };
  }
}
```

Or implement the interface directly for tools-only plugins:

```typescript
import { tool } from "ai";
import { z } from "zod";
import type { Plugin } from "gauss";

const timePlugin: Plugin = {
  name: "time",
  tools: {
    current_time: tool({
      description: "Get the current date and time",
      inputSchema: z.object({}),
      execute: async () => new Date().toISOString(),
    }),
  },
};
```

## Built-in Plugins

| Plugin | Description | Tools Injected |
|--------|-------------|----------------|
| [GuardrailsPlugin](./guardrails) | Input/output validation, content filtering, PII detection | — |
| [WorkflowPlugin](./workflow) | Multi-step workflow with retry, rollback, conditions | — |
| [ObservabilityPlugin](./observability) | Tracing, metrics, and structured logging | — |
| [OneCrawlPlugin](./oncrawl) | Web scraping and search | `scrape`, `search`, `batch` |
| [VectorlessPlugin](./vectorless) | RAG/knowledge extraction | `generate`, `query`, `search-entities`, `list` |
| [EvalsPlugin](./evals) | Evaluation metrics collection | — |
| `AgentCardPlugin` | Agent card generation and serving | — |
| `A2APlugin` | Agent-to-Agent protocol (JSON-RPC) | `a2a:call` |
