# Gauss

[![npm version](https://img.shields.io/npm/v/gauss-ts)](https://www.npmjs.com/package/gauss-ts)
[![CI](https://github.com/giulio-leone/gauss/actions/workflows/ci.yml/badge.svg)](https://github.com/giulio-leone/gauss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Rust-powered AI agent framework for TypeScript.**
> Zero overhead · Plug & play · Native performance via NAPI bindings.

---

## Install

```bash
npm install gauss-ts
```

## Quick Start — One Line

```ts
import { gauss } from "gauss-ts";

const answer = await gauss("Explain quantum computing in 3 sentences");
```

That's it. Auto-detects your API key from environment variables.

## Agent with Tools

```ts
import { Agent } from "gauss-ts";

const agent = new Agent({
  name: "assistant",
  provider: "openai",
  model: "gpt-4o",
  instructions: "You are a helpful coding assistant.",
});

agent.addTool({
  name: "search",
  description: "Search the web",
  parameters: { type: "object", properties: { query: { type: "string" } } },
});

const result = await agent.run("Find the latest TypeScript release");
console.log(result.text);
```

## Streaming

```ts
import { Agent } from "gauss-ts";

const agent = new Agent({ provider: "openai", model: "gpt-4o" });
const stream = agent.streamIter("Tell me a story");

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.text);
  }
}
console.log("\n\nFull text:", stream.text);
```

## Batch Processing

Run multiple prompts in parallel with concurrency control:

```ts
import { batch } from "gauss-ts";

const results = await batch(
  ["Translate: Hello", "Translate: World", "Translate: Goodbye"],
  { concurrency: 2, provider: "openai" }
);
results.forEach((r) => console.log(r.result?.text ?? r.error?.message));
```

## Multi-Agent Graph

```ts
import { Agent, Graph } from "gauss-ts";

const researcher = new Agent({ name: "researcher", instructions: "Research thoroughly" });
const writer = new Agent({ name: "writer", instructions: "Write clearly" });

const pipeline = new Graph()
  .addNode("research", researcher)
  .addNode("write", writer)
  .addEdge("research", "write");

const result = await pipeline.run("Explain quantum computing");
```

## Workflow

```ts
import { Agent, Workflow } from "gauss-ts";

const planner = new Agent({ name: "planner" });
const executor = new Agent({ name: "executor" });

const wf = new Workflow()
  .addStep("plan", planner)
  .addStep("execute", executor)
  .addDependency("execute", "plan");

const result = await wf.run("Build a REST API");
```

## Multi-Agent Network

```ts
import { Agent, Network } from "gauss-ts";

const analyst = new Agent({ name: "analyst" });
const coder = new Agent({ name: "coder" });

const net = new Network()
  .addAgent(analyst)
  .addAgent(coder)
  .setSupervisor("analyst");

const result = await net.delegate("coder", "Implement a sorting algorithm");
```

## Retry with Backoff

```ts
import { Agent, withRetry, retryable } from "gauss-ts";

// Wrap any async function:
const data = await withRetry(() => agent.run("Summarize this"), {
  maxRetries: 3,
  backoff: "exponential",   // "fixed" | "linear" | "exponential"
  baseDelayMs: 1000,
  jitter: 0.1,
  onRetry: (err, attempt, delay) => console.log(`Retry ${attempt} in ${delay}ms`),
});

// Or wrap an agent:
const resilientRun = retryable(agent, { maxRetries: 5 });
const result = await resilientRun("Hello");
```

## Structured Output

Extract typed JSON from LLM responses with auto-retry on parse failure:

```ts
import { Agent, structured } from "gauss-ts";

const agent = new Agent({ provider: "openai", model: "gpt-4o" });

const { data } = await structured(agent, "List 3 programming languages", {
  schema: {
    type: "object",
    properties: {
      languages: { type: "array", items: { type: "string" } },
    },
    required: ["languages"],
  },
  maxParseRetries: 2,
});

console.log(data.languages); // ["TypeScript", "Rust", "Python"]
```

## Prompt Templates

Composable, type-safe prompt construction with `{{variable}}` placeholders:

```ts
import { template, summarize, translate, codeReview } from "gauss-ts";

// Custom template:
const greet = template("Hello {{name}}, you are a {{role}}.");
console.log(greet({ name: "Alice", role: "developer" }));

// Built-in templates:
const prompt = summarize({ format: "article", style: "bullet points", text: "..." });
const translated = translate({ language: "French", text: "Hello world" });
const review = codeReview({ language: "typescript", code: "const x = 1;" });

// Composition:
const withTone = template("{{base}}\n\nUse a {{tone}} tone.");
const prompt2 = withTone({
  base: summarize({ format: "report", style: "concise", text: "..." }),
  tone: "professional",
});
```

## Pipeline & Async Helpers

Compose agent operations into clean data flows:

```ts
import { pipe, mapAsync, filterAsync, reduceAsync, compose } from "gauss-ts";

// Pipe: chain async steps
const result = await pipe(
  "Explain AI",
  (prompt) => agent.run(prompt),
  (result) => result.text.toUpperCase(),
);

// MapAsync: process items with concurrency
const descriptions = await mapAsync(
  ["apple", "banana", "cherry"],
  (fruit) => agent.run(`Describe ${fruit}`),
  { concurrency: 2 },
);

// FilterAsync: filter with async predicate
const longOnes = await filterAsync(
  descriptions,
  async (r) => r.text.length > 100,
);

// ReduceAsync: sequential aggregation
const summary = await reduceAsync(
  documents,
  async (acc, doc) => {
    const r = await agent.run(`Combine:\n${acc}\n\nNew:\n${doc}`);
    return r.text;
  },
  "",
);

// Compose: build reusable transforms
const enhance = compose(
  async (text: string) => `[System] ${text}`,
  async (text: string) => text.trim(),
);
```

## Resilience

```ts
import { createFallbackProvider, createCircuitBreaker, createResilientAgent } from "gauss-ts";

const fallback = createFallbackProvider([
  { provider: "openai", model: "gpt-4o" },
  { provider: "anthropic", model: "claude-sonnet-4-20250514" },
]);

const breaker = createCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30000 });
const agent = createResilientAgent({ fallback, circuitBreaker: breaker });
```

## All Features

| Feature | Module | Description |
|---------|--------|-------------|
| **Agent** | `Agent`, `gauss()` | LLM agent with tools, structured output, streaming |
| **Streaming** | `AgentStream` | Async iterable streaming with `for await` |
| **Batch** | `batch()` | Parallel prompt execution with concurrency control |
| **Graph** | `Graph` | DAG-based multi-agent pipeline |
| **Workflow** | `Workflow` | Step-based execution with dependencies |
| **Network** | `Network` | Multi-agent delegation with supervisor |
| **Memory** | `Memory` | Persistent conversation memory |
| **VectorStore** | `VectorStore` | Embedding storage and semantic search |
| **Middleware** | `MiddlewareChain` | Request/response processing pipeline |
| **Guardrails** | `GuardrailChain` | Content moderation, PII, token limits, regex |
| **Retry** | `withRetry`, `retryable` | Exponential/linear/fixed backoff with jitter |
| **Structured** | `structured()` | Typed JSON extraction with auto-retry |
| **Templates** | `template()` | Composable prompt templates with built-ins |
| **Pipeline** | `pipe`, `mapAsync`, `compose` | Async data flow composition |
| **Evaluation** | `EvalRunner` | Agent quality scoring with datasets |
| **Telemetry** | `Telemetry` | Spans, metrics, and export |
| **Approval** | `ApprovalManager` | Human-in-the-loop approval flow |
| **Checkpoint** | `CheckpointStore` | Save/restore agent state |
| **MCP** | `McpServer` | Model Context Protocol server |
| **Resilience** | `createFallbackProvider` | Fallback, circuit breaker, retry |
| **Tokens** | `countTokens` | Token counting and context window info |
| **Plugins** | `PluginRegistry` | Extensible plugin system |
| **Config** | `parseAgentConfig` | JSON config parsing with env resolution |
| **Stream** | `parsePartialJson` | Streaming JSON parser |

## Auto Provider Detection

Set one environment variable and go:

```bash
# Any one of these:
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=AIza...
export GROQ_API_KEY=gsk_...
export DEEPSEEK_API_KEY=sk-...
export OLLAMA_HOST=http://localhost:11434
```

Gauss auto-detects which provider to use based on available keys.

## Architecture

Gauss-TS is a thin SDK wrapping **[gauss-core](https://github.com/giulio-leone/gauss-core)** (Rust) via NAPI bindings. All heavy lifting — agent loops, tool execution, middleware, graph/workflow orchestration — runs at native speed in Rust.

```
TypeScript SDK (24 modules)
       │
       ▼
  NAPI Bindings (80+ functions)
       │
       ▼
  gauss-core (Rust engine)
```

## Ecosystem

| Package | Language | Description |
|---------|----------|-------------|
| [`gauss-core`](https://github.com/giulio-leone/gauss-core) | Rust | Core engine — NAPI + PyO3 + WASM |
| [`gauss-ts`](https://github.com/giulio-leone/gauss) | TypeScript | This SDK (NAPI bindings) |
| [`gauss-py`](https://github.com/giulio-leone/gauss-py) | Python | Python SDK (PyO3 bindings) |

## API Reference

Full API documentation is available via TypeDoc:

```bash
npm run docs
```

This generates HTML docs in `docs/api/` from JSDoc comments in the source.

## License

MIT © [Giulio Leone](https://github.com/giulio-leone)
