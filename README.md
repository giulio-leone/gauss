<div align="center">

# 🔮 gauss-ts

### Rust-powered AI Agent SDK for TypeScript

[![CI](https://github.com/giulio-leone/gauss/actions/workflows/ci.yml/badge.svg)](https://github.com/giulio-leone/gauss/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/gauss-ts.svg)](https://www.npmjs.com/package/gauss-ts)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Rust-powered • Multi-provider • Enterprise-grade • Plug-and-play DX**

</div>

Gauss gives you a beautiful TypeScript API over a high-performance Rust core.
Build single agents, hierarchical teams, DAG pipelines, MCP/A2A systems, and enterprise guardrailed workflows in a few lines.

---

## Install

```bash
npm install gauss-ts
```

Set one provider key (auto-detection is built in):

```bash
export OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY / GOOGLE_API_KEY / OPENROUTER_API_KEY / ...
```

---

## Quick Start

### One-liner

```ts
import { gauss } from "gauss-ts";

const text = await gauss("Explain retrieval-augmented generation in 3 bullets.");
console.log(text);
```

### Full control

```ts
import { Agent, OPENAI_DEFAULT } from "gauss-ts";

const agent = new Agent({
  name: "assistant",
  model: OPENAI_DEFAULT, // "gpt-5.2"
  instructions: "You are a concise senior engineer.",
  temperature: 0.2,
});

const result = await agent.run("Design a clean API for a weather service.");
console.log(result.text);
agent.destroy();
```

---

## Multi-Agent in a Few Lines

### 1) Team.quick() (hierarchical team bootstrap)

```ts
import { Team } from "gauss-ts";

const team = Team.quick("architecture-team", "parallel", [
  { name: "planner", instructions: "Break work into milestones." },
  { name: "implementer", instructions: "Produce production-ready code." },
  { name: "reviewer", instructions: "Find defects and risks." },
]);

const out = await team.run("Implement a resilient webhook ingestion service.");
console.log(out.finalText);
team.destroy();
```

### 2) Graph.pipeline() (2-line DAG)

```ts
import { Agent, Graph } from "gauss-ts";

const graph = Graph.pipeline([
  { nodeId: "analyze", agent: new Agent({ instructions: "Analyze requirements" }) },
  { nodeId: "build", agent: new Agent({ instructions: "Implement solution" }) },
  { nodeId: "verify", agent: new Agent({ instructions: "Validate outputs" }) },
]);

const out = await graph.run("Build a typed SDK wrapper around a REST API.");
console.log(out.finalText);
graph.destroy();
```

---

## Agent DX

### Inline tools with `withTool()`

```ts
import { Agent } from "gauss-ts";

const agent = new Agent({ instructions: "Use tools when useful." })
  .withTool(
    "sum",
    "Sum two numbers",
    ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
    {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    }
  );

const out = await agent.run("What is 12 + 30?");
console.log(out.text);
agent.destroy();
```

### Streaming helpers

```ts
// Low-level async iterable events
const stream = agent.streamIter("Write a short release note");
for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.text ?? "");
}

// High-level DX helper: returns final text + optional delta callback
const finalText = await agent.streamText("Write a changelog", (delta) => {
  process.stdout.write(delta);
});
```

### Config helpers

```ts
// Explicit env-intent constructor
const a = Agent.fromEnv({ instructions: "Be precise." });

// Clone with a different model
const b = a.withModel("gpt-4.1");
```

### Unified Control Plane (M51 foundation)

```ts
import { ControlPlane, Telemetry, ApprovalManager } from "gauss-ts";

const cp = new ControlPlane({
  telemetry: new Telemetry(),
  approvals: new ApprovalManager(),
  model: "gpt-5.2",
});

cp.setCostUsage({ inputTokens: 1200, outputTokens: 600 });
const { url } = await cp.startServer("127.0.0.1", 0);
console.log(`Control Plane: ${url}`);
```

---

## Core Features

- **Agents**: `Agent`, `gauss()`
- **Teams**: `Team`, `Team.quick()`
- **Graphs**: `Graph`, `Graph.pipeline()`, `addConditionalEdge()`
- **Workflows / Networks**: `Workflow`, `Network`
- **Typed tools**: `tool()`, `createToolExecutor()`, `withTool()`
- **MCP**: `McpServer`, `McpClient`
- **A2A**: `A2aClient`
- **Memory + RAG**: `Memory`, `VectorStore`, `TextSplitter`, `loadText/loadMarkdown/loadJson`
- **Guardrails + Middleware**: `GuardrailChain`, `MiddlewareChain`
- **Reliability**: retry, circuit breaker, fallback providers
- **Observability & quality**: `Telemetry`, `EvalRunner`
- **Control plane**: `ControlPlane` (local snapshot API + dashboard)
- **Enterprise preset**: `enterprisePreset()`, `enterpriseRun()`

---

## Errors (typed hierarchy)

```ts
import {
  GaussError,
  DisposedError,
  ProviderError,
  ToolExecutionError,
  ValidationError,
} from "gauss-ts";

try {
  await agent.run("hello");
} catch (err) {
  if (err instanceof DisposedError) {
    // resource already destroyed
  }
}
```

---

## Model Constants

```ts
import {
  OPENAI_DEFAULT, OPENAI_FAST, OPENAI_REASONING,
  ANTHROPIC_DEFAULT, ANTHROPIC_FAST, ANTHROPIC_PREMIUM,
  GOOGLE_DEFAULT, GOOGLE_PREMIUM,
  DEEPSEEK_DEFAULT, DEEPSEEK_REASONING,
  PROVIDER_DEFAULTS, defaultModel,
} from "gauss-ts";
```

---

## Providers

| Provider | Env Variable | Example Default |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `gpt-5.2` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| Google | `GOOGLE_API_KEY` | `gemini-2.5-flash` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| Groq | `GROQ_API_KEY` | provider-dependent |
| Ollama | local runtime | `llama3.2` |
| OpenRouter | `OPENROUTER_API_KEY` | `openai/gpt-5.2` |
| Together | `TOGETHER_API_KEY` | provider-dependent |
| Fireworks | `FIREWORKS_API_KEY` | provider-dependent |
| Mistral | `MISTRAL_API_KEY` | provider-dependent |
| Perplexity | `PERPLEXITY_API_KEY` | provider-dependent |
| xAI | `XAI_API_KEY` | provider-dependent |

---

## Architecture

```text
gauss-ts (TypeScript SDK)
        │
        ▼
gauss-napi (NAPI bindings)
        │
        ▼
gauss-core (Rust engine)
```

All heavy orchestration and runtime logic is executed in Rust.

---

## Ecosystem

| Package | Language | Repo |
|---|---|---|
| `gauss-core` | Rust | https://github.com/giulio-leone/gauss-core |
| `gauss-ts` | TypeScript | https://github.com/giulio-leone/gauss |
| `gauss-py` | Python | https://github.com/giulio-leone/gauss-py |

## License

MIT © [Giulio Leone](https://github.com/giulio-leone)
