---
sidebar_position: 5
title: AgentGraph
description: Multi-agent collaboration with DAG execution, forking, and consensus
---

# AgentGraph

`AgentGraph` enables multi-agent collaboration using a declarative DAG (Directed Acyclic Graph) API. Agents are nodes, dependencies are edges, and parallel execution is managed automatically.

## Quick Start

```typescript
import { AgentGraph, LlmJudgeConsensus } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const model = openai("gpt-4o");

const graph = AgentGraph.create({ maxConcurrency: 3 })
  .node("research", {
    model,
    instructions: "Research the topic thoroughly.",
  })
  .node("code", {
    model,
    instructions: "Write clean, tested code.",
  })
  .node("test", {
    model,
    instructions: "Write comprehensive tests.",
  })
  .edge("research", "code")    // code depends on research
  .edge("code", "test")        // test depends on code
  .fork("review", [
    { model, instructions: "Review for correctness and bugs." },
    { model, instructions: "Review for performance and style." },
    { model, instructions: "Review for security vulnerabilities." },
  ])
  .consensus("review", new LlmJudgeConsensus({ model }))
  .edge("test", "review")
  .build();

const result = await graph.run("Build a REST API with JWT auth.");
console.log(result.output);
console.log(result.nodeResults);      // Per-node results
console.log(result.totalDurationMs);
```

## Builder API

### `AgentGraph.create(config?)`

Returns an `AgentGraphBuilder`:

```typescript
const builder = AgentGraph.create({
  maxDepth: 10,          // Default: 10
  maxConcurrency: 5,     // Default: 5
  timeoutMs: 600_000,    // Default: 600000 (10 min)
  maxTokenBudget: 1_000_000,  // Default: 1000000
});
```

### `.node(id, config)`

Add an agent node:

```typescript
builder.node("analyst", {
  model: openai("gpt-4o"),
  instructions: "You are a data analyst.",
  maxSteps: 20,
});
```

### `.edge(from, to)`

Define a dependency (DAG edge):

```typescript
builder.edge("research", "analysis"); // analysis runs after research
```

### `.fork(id, configs)`

Create a parallel fork (minimum 2 agents):

```typescript
builder.fork("review", [
  { model, instructions: "Review for correctness." },
  { model, instructions: "Review for performance." },
]);
```

### `.consensus(forkId, strategy)`

Set a consensus strategy for a fork:

```typescript
builder.consensus("review", new LlmJudgeConsensus({ model }));
```

### `.build()`

Validates the graph (no cycles, all edge targets exist) and constructs the `AgentGraph`.

## Consensus Strategies

| Strategy | Description |
|----------|-------------|
| `LlmJudgeConsensus` | Uses an LLM to evaluate fork results and pick the best |
| `MajorityVoteConsensus` | Simple majority vote across outputs |
| `DebateConsensus` | Multi-round debate between outputs |

### Custom Consensus

Implement `ConsensusPort`:

```typescript
import type { ConsensusPort, ConsensusResult } from "@giulio-leone/gaussflow-agent";

class CustomConsensus implements ConsensusPort {
  async evaluate(
    results: Array<{ id: string; output: string }>
  ): Promise<ConsensusResult> {
    // Your evaluation logic
    const winner = results[0];
    return {
      winnerId: winner.id,
      winnerOutput: winner.output,
      reasoning: "Selected the first result",
    };
  }
}
```

## Streaming

Stream graph events in real-time:

```typescript
for await (const event of graph.stream("Build a REST API")) {
  switch (event.type) {
    case "graph:start":
      console.log(`Starting graph with ${event.nodeCount} nodes`);
      break;
    case "node:start":
      console.log(`Node ${event.nodeId} started`);
      break;
    case "node:complete":
      console.log(`Node ${event.nodeId} completed in ${event.result.durationMs}ms`);
      break;
    case "fork:start":
      console.log(`Fork ${event.forkId} started with ${event.agentCount} agents`);
      break;
    case "consensus:result":
      console.log(`Consensus for ${event.forkId}: ${event.output}`);
      break;
    case "graph:complete":
      console.log(`Graph completed in ${event.result.totalDurationMs}ms`);
      break;
  }
}
```

## Stream Event Types

| Event | Fields |
|-------|--------|
| `graph:start` | `nodeCount` |
| `node:start` | `nodeId` |
| `node:complete` | `nodeId`, `result` |
| `node:error` | `nodeId`, `error` |
| `fork:start` | `forkId`, `agentCount` |
| `fork:complete` | `forkId`, `results` |
| `consensus:start` | `forkId` |
| `consensus:result` | `forkId`, `output` |
| `graph:complete` | `result` |
| `graph:error` | `error`, `partialResults` |

## GraphResult

```typescript
interface GraphResult {
  output: string;                                    // Final output
  nodeResults: Record<string, NodeResultValue>;      // Per-node results
  totalDurationMs: number;
  totalTokenUsage: { input: number; output: number };
}

interface NodeResultValue {
  nodeId: string;
  output: string;
  tokenUsage?: { input: number; output: number };
  durationMs: number;
}
```

## Validation

The builder automatically validates:

- **Edge targets exist** — All nodes referenced in edges must be defined
- **No cycles** — The graph must be a DAG (Directed Acyclic Graph)
- **Fork minimum** — Forks require at least 2 agent configurations
