---
sidebar_position: 2
title: WorkflowPlugin
description: Multi-step workflow execution with retry, rollback, and conditions
---

# WorkflowPlugin

The `WorkflowPlugin` executes a sequence of steps before the agent runs. Each step can modify a shared context, have retry logic, define rollback handlers, and be conditionally skipped.

## Quick Start

```typescript
import { Agent, createWorkflowPlugin } from "gauss";
import type { WorkflowStep } from "gauss";

const steps: WorkflowStep[] = [
  {
    id: "fetch-config",
    name: "Fetch Configuration",
    execute: async (ctx) => {
      const res = await fetch("https://api.example.com/config");
      return { ...ctx, config: await res.json() };
    },
  },
  {
    id: "validate",
    name: "Validate Config",
    condition: (ctx) => ctx.config != null,
    execute: async (ctx) => {
      if (!ctx.config.apiKey) throw new Error("Missing API key");
      return { ...ctx, validated: true };
    },
  },
  {
    id: "provision",
    name: "Provision Resources",
    execute: async (ctx) => {
      const resource = await provisionResource(ctx.config);
      return { ...ctx, resourceId: resource.id };
    },
    rollback: async (ctx) => {
      if (ctx.resourceId) await deleteResource(ctx.resourceId);
    },
    retry: { maxAttempts: 3, backoffMs: 2000, backoffMultiplier: 2 },
  },
];

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "Summarize the provisioned resources.",
})
  .use(createWorkflowPlugin({
    steps,
    initialContext: { env: "production" },
  }))
  .build();

const result = await agent.run("What was provisioned?");
```

## How It Works

1. The workflow runs in the `beforeRun` hook, **before** the agent loop starts
2. Steps execute sequentially, each receiving and returning the shared `WorkflowContext`
3. The final context is appended to the agent's prompt as a summary
4. If a step fails, all previously completed steps are rolled back in reverse order

## Configuration

```typescript
interface WorkflowPluginConfig {
  steps: WorkflowStep[];
  initialContext?: WorkflowContext;  // Default: {}
}
```

## WorkflowStep

```typescript
interface WorkflowStep {
  id: string;                                              // Unique step identifier
  name: string;                                            // Display name
  execute: (ctx: WorkflowContext) => Promise<WorkflowContext>;  // Step logic
  condition?: (ctx: WorkflowContext) => boolean;           // Skip if returns false
  rollback?: (ctx: WorkflowContext) => Promise<void>;      // Cleanup on failure
  retry?: Partial<RetryConfig>;                            // Retry configuration
}
```

## RetryConfig

```typescript
interface RetryConfig {
  maxAttempts: number;       // Default: 3
  backoffMs: number;         // Default: 1000
  backoffMultiplier: number; // Default: 2 (exponential backoff)
}
```

Retry uses exponential backoff: `delay = backoffMs × backoffMultiplier^(attempt-1)`.

## WorkflowResult

Access the result via `plugin.getLastResult()`:

```typescript
const workflow = createWorkflowPlugin({ steps });

const agent = Agent.create({ model, instructions: "..." })
  .use(workflow)
  .build();

await agent.run("Process results");

const result = workflow.getLastResult();
console.log(result?.status);         // "completed" | "failed"
console.log(result?.completedSteps); // ["fetch-config", "validate", "provision"]
console.log(result?.skippedSteps);   // []
console.log(result?.totalDurationMs);
```

```typescript
interface WorkflowResult {
  status: "completed" | "failed";
  context: WorkflowContext;
  completedSteps: string[];
  skippedSteps: string[];
  failedStep?: string;        // Only on failure
  error?: string;             // Only on failure
  totalDurationMs: number;
}
```

## Error Handling

Failed workflows throw a `WorkflowError`:

```typescript
import { WorkflowError } from "gauss";

try {
  await agent.run("Go");
} catch (error) {
  if (error instanceof WorkflowError) {
    console.log(error.result.failedStep);  // "provision"
    console.log(error.result.error);       // "Connection timeout"
  }
}
```

## Rollback Behavior

- Rollbacks execute in **reverse order** of completed steps
- Rollback errors are **swallowed** to ensure all rollbacks are attempted
- Only steps with a `rollback` handler are rolled back
