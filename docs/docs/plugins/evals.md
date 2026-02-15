---
sidebar_position: 6
title: EvalsPlugin
description: Evaluation metrics collection with custom scorers
---

# EvalsPlugin

The `EvalsPlugin` automatically collects evaluation metrics for every agent run — latency, token usage, tool call frequency, and custom scoring functions.

## Quick Start

```typescript
import { DeepAgent, createEvalsPlugin } from "@giulio-leone/gaussflow-agent";

const evals = createEvalsPlugin({
  persist: true,
  scorers: [
    {
      name: "brevity",
      score: (_prompt, output) => Math.min(output.length / 1000, 1),
    },
  ],
  onEval: (result) => {
    console.log(`Latency: ${result.metrics.latencyMs}ms`);
    console.log(`Steps: ${result.metrics.stepCount}`);
    console.log(`Tokens: ${result.metrics.tokenUsage.total}`);
  },
});

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant.",
})
  .use(evals)
  .build();

await agent.run("Explain TypeScript generics.");

const lastResult = evals.getLastResult();
console.log(lastResult?.metrics.customScores.brevity); // 0.0 - 1.0
```

## Configuration

```typescript
interface EvalsPluginOptions {
  scorers?: EvalScorer[];      // Custom scoring functions
  persist?: boolean;           // Persist results via MemoryPort (default: false)
  onEval?: (result: EvalResult) => void | Promise<void>;  // Callback per evaluation
}
```

## Custom Scorers

```typescript
interface EvalScorer {
  readonly name: string;
  score(prompt: string, output: string, metrics: EvalMetrics): Promise<number> | number;
}
```

Scorers receive the original prompt, the agent's output, and the collected metrics. They return a numeric score. If a scorer throws, its score is recorded as `-1`.

### Examples

```typescript
const scorers: EvalScorer[] = [
  // Score based on output length
  { name: "length", score: (_, output) => Math.min(output.length / 1000, 1) },

  // Score based on step efficiency
  { name: "efficiency", score: (_, __, metrics) => 1 / (1 + metrics.stepCount) },

  // Score based on whether output contains code
  { name: "has-code", score: (_, output) => output.includes("```") ? 1 : 0 },
];
```

## Collected Metrics

```typescript
interface EvalMetrics {
  latencyMs: number;                              // Total run time
  stepCount: number;                              // Number of steps
  toolCalls: Record<string, number>;              // Tool call counts by name
  tokenUsage: {
    prompt: number;                               // Input tokens
    completion: number;                           // Output tokens
    total: number;                                // Total tokens
  };
  customScores: Record<string, number>;           // Scorer results
}
```

## EvalResult

```typescript
interface EvalResult {
  id: string;                 // Unique eval ID
  sessionId: string;          // Agent session ID
  prompt: string;             // Original prompt
  output: string;             // Agent output
  metrics: EvalMetrics;       // Collected metrics
  createdAt: number;          // Timestamp
}
```

## Accessing Results

```typescript
const allResults = evals.getResults();    // All collected results
const lastResult = evals.getLastResult(); // Most recent result
evals.clearResults();                     // Clear collected results
```

## Persistence

When `persist: true`, eval results are saved to the agent's `MemoryPort` as metadata with key `eval:<id>`. This allows retrieval across sessions when using a persistent memory adapter like `SupabaseMemoryAdapter`.

## Hooks Used

| Hook | Purpose |
|------|---------|
| `beforeRun` | Records start time and prompt |
| `afterTool` | Counts tool calls by name |
| `afterRun` | Calculates metrics, runs scorers, persists results |
| `onError` | Cleans up run state on errors |
