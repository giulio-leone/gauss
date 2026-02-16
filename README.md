# GaussFlow (@giulio-leone/gaussflow-agent)

[![CI](https://github.com/giulio-leone/onegenui-deep-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/giulio-leone/onegenui-deep-agents/actions/workflows/ci.yml)

> **GaussFlow** — AI Agent Framework built on Vercel AI SDK v6

A hexagonal-architecture agent framework with built-in planning, context management, subagent orchestration, persistent memory, and MCP integration. Agents operate through a tool-loop powered by AI SDK's `ToolLoopAgent`, with filesystem, planning, and subagent tools composed via a fluent builder API.

## Features

- **Builder pattern** — fluent API with `DeepAgent.create()`, `.minimal()`, `.full()`, and `.auto()` factory methods
- **Hexagonal architecture** — ports and adapters for filesystem, memory, MCP, validation, tracing, metrics, logging, and model access
- **Plugin system** — deterministic middleware lifecycle with hook-based extensions and tool injection
- **WorkflowPlugin** — multi-step workflow execution with retry, rollback, and conditional steps
- **ObservabilityPlugin** — three-pillar observability: distributed tracing, metrics collection, and structured logging
- **Guardrails** — input/output validation with Zod schemas, content filtering, and PII detection
- **Web scraping tools** — crawl, search, and batch scrape via OneCrawl plugin
- **RAG/knowledge tools** — entity extraction, knowledge queries via Vectorless plugin
- **Evaluation metrics** — latency, token usage, tool frequency, and custom scoring
- **ValidationPort** — engine-agnostic validation with `ZodValidationAdapter`
- **BasePlugin** — abstract base class for building custom plugins
- **AbstractBuilder** — template method pattern for validated, type-safe builders
- **Multi-agent collaboration** — DAG-based `AgentGraph` with parallel forking and consensus strategies
- **Built-in planning** — structured todo management with dependency tracking and priority
- **Subagent orchestration** — spawn child agents with configurable depth limits and timeouts
- **Context management** — automatic rolling summarization, tool-result offloading, and message truncation
- **Human-in-the-loop approval** — configurable per-tool approval gates with allow/deny lists
- **Checkpointing** — periodic state snapshots for session resume
- **Event system** — typed lifecycle events with wildcard subscriptions
- **MCP integration** — discover and execute tools from any MCP server
- **Cross-session learning** — user profiles, memories, and shared knowledge persisting across sessions
- **Multi-runtime** — runs on Node.js, Deno, Bun, Edge (Cloudflare Workers, Vercel Edge), and Browser
- **CLI** — interactive REPL and single-shot mode with `gaussflow chat/run/demo` commands
- **REST API** — zero-dependency HTTP server for multi-language access (Python, Go, Ruby, etc.)
- **Resilience patterns** — circuit breaker, rate limiter, and tool cache for robust agent operations
- **Template engine** — Handlebars-style `PromptTemplate` with conditionals, loops, filters, and partials
- **Partial JSON streaming** — incremental JSON parsing for LLM streams via `streamJson<T>()` and `JsonAccumulator`
- **Tool composition pipeline** — sequential `.pipe()`, automatic `.withFallback()`, and `.withMiddleware()` hooks

## Resilience Patterns

GaussFlow includes built-in resilience patterns to handle failures, rate limits, and caching:

### CircuitBreaker

Prevents cascading failures by temporarily blocking failing operations:

```typescript
import { DeepAgent, CircuitBreaker } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,        // Open after 5 failures
  resetTimeoutMs: 30_000,     // Wait 30s before trying again
  monitorWindowMs: 60_000,    // Track failures over 1 minute
});

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a resilient assistant.",
})
  .withCircuitBreaker(circuitBreaker)
  .build();

// Circuit breaker automatically wraps tool executions
const result = await agent.run("Process this data safely.");
```

States: `CLOSED` (normal) → `OPEN` (blocking) → `HALF_OPEN` (testing).

### RateLimiter

Controls request rate using token bucket algorithm:

```typescript
import { DeepAgent, RateLimiter } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const rateLimiter = new RateLimiter({
  maxTokens: 10,              // 10 requests burst
  refillRateMs: 1000,         // 1 token per second
});

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a rate-limited assistant.",
})
  .withRateLimiter(rateLimiter)
  .build();

// Automatically throttles tool executions
const result = await agent.run("Make API calls at controlled rate.");
```

### ToolCache

LRU cache with TTL for tool execution results:

```typescript
import { DeepAgent, ToolCache } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const toolCache = new ToolCache({
  defaultTtlMs: 300_000,      // 5 minute TTL
  maxSize: 1000,              // 1000 entries max
});

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a caching assistant.",
})
  .withToolCache(toolCache)
  .build();

// Identical tool calls return cached results
const result = await agent.run("Optimize with smart caching.");
```

### Combined Resilience

Use all patterns together for maximum robustness:

```typescript
const agent = DeepAgent.create({ model, instructions: "..." })
  .withCircuitBreaker(new CircuitBreaker({ failureThreshold: 3 }))
  .withRateLimiter(new RateLimiter({ maxTokens: 5, refillRateMs: 2000 }))
  .withToolCache(new ToolCache({ defaultTtlMs: 600_000 }))
  .build();
```

## Error Handling

GaussFlow provides a hierarchical error system with specific error classes:

### GaussFlowError Hierarchy

```typescript
import {
  GaussFlowError,          // Base error class
  ToolExecutionError,      // Tool execution failures
  PluginError,            // Plugin lifecycle errors  
  McpConnectionError,     // MCP server connection issues
  RuntimeError,           // Runtime/platform errors
  StreamingError,         // Streaming/SSE errors
  ConfigurationError,     // Invalid configuration
} from "@giulio-leone/gaussflow-agent";
```

### Error Properties

All errors include structured information:

```typescript
try {
  await agent.run("Might fail");
} catch (error) {
  if (error instanceof GaussFlowError) {
    console.log("Error code:", error.code);
    console.log("Message:", error.message);
    console.log("Cause:", error.cause);
  }
}
```

### Error Codes

| Error Class | Code | Description |
|-------------|------|-------------|
| `ToolExecutionError` | `TOOL_EXECUTION_ERROR` | Tool failed to execute |
| `PluginError` | `PLUGIN_ERROR` | Plugin hook failure |
| `McpConnectionError` | `MCP_CONNECTION_ERROR` | MCP server unreachable |
| `RuntimeError` | `RUNTIME_ERROR` | Platform/runtime issue |
| `StreamingError` | `STREAMING_ERROR` | SSE/streaming failure |
| `ConfigurationError` | `CONFIGURATION_ERROR` | Invalid config provided |

### Error Event Handling

Listen for errors via the event system:

```typescript
const agent = DeepAgent.create({ model, instructions: "..." })
  .on("error", (event) => {
    console.error("Agent error:", event.data);
    
    // Handle specific error types
    if (event.data instanceof ToolExecutionError) {
      console.log("Tool failed:", event.data.code);
    }
  })
  .build();
```

## Performance

GaussFlow includes several performance optimization features:

### Memory Bounds Configuration

Control context window memory usage:

```typescript
const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are an efficient assistant.",
  context: {
    summarizationThreshold: 0.70,    // Summarize at 70% context
    truncationThreshold: 0.85,       // Truncate at 85% context
    offloadTokenThreshold: 20000,    // Offload large results to VFS
    preserveRecentMessages: 10,      // Keep 10 recent messages
  }
}).build();
```

### Lazy Loading

Adapters and resources are loaded on-demand:

```typescript
// Runtime auto-detection happens only when needed
const agent = DeepAgent.auto({ model, instructions: "..." });

// MCP connections established lazily
const agent = DeepAgent.create({ model, instructions: "..." })
  .withMcp(mcpAdapter)  // Connected on first tool call
  .build();
```

### Backpressure Handling

Rate limiter provides automatic backpressure:

```typescript
const rateLimiter = new RateLimiter({
  maxTokens: 5,
  refillRateMs: 1000,
});

// Tool executions automatically queue when rate limit exceeded
const agent = DeepAgent.create({ model, instructions: "..." })
  .withRateLimiter(rateLimiter)
  .build();

// Multiple concurrent runs will be throttled appropriately
const results = await Promise.all([
  agent.run("Task 1"),
  agent.run("Task 2"), 
  agent.run("Task 3"),
]);
```

### Performance Monitoring

Use `ObservabilityPlugin` for performance metrics:

```typescript
import { DeepAgent, ObservabilityPlugin } from "@giulio-leone/gaussflow-agent";

const observability = new ObservabilityPlugin({
  tracing: { enabled: true },
  metrics: { enabled: true },
  logging: { level: "info" },
});

const agent = DeepAgent.create({ model, instructions: "..." })
  .use(observability)
  .build();

// Metrics collected automatically:
// - Tool execution latency
// - Token usage per step
// - Memory consumption
// - Cache hit/miss rates
```

## Installation

```bash
pnpm add @giulio-leone/gaussflow-agent
```

### Peer Dependencies

The package requires `ai` (v6+) and `zod` (v4+) as direct dependencies. The following peer dependencies are optional:

| Package | Purpose |
|---------|---------|
| `@giulio-leone/gaussflow-mcp` | GaussFlow MCP registry adapter |
| `@giulio-leone/gaussflow-providers` | AI model provider utilities |
| `@supabase/supabase-js` | Supabase-backed persistent memory |
| `tiktoken` | Accurate BPE token counting |
| `@ai-sdk/mcp` | AI SDK MCP client adapter |
| `onecrawl` | Web scraping and search tools (OneCrawlPlugin) |
| `@giulio-leone/gaussflow-vectorless` | RAG/knowledge extraction (VectorlessPlugin) |

Install only the peers you need:

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

## Architecture

GaussFlow follows **hexagonal architecture** (ports & adapters). The core domain (DeepAgent) depends only on port interfaces; adapters implement those interfaces for specific platforms and services. Plugins extend behavior via lifecycle hooks.

```
┌──────────────────────────────────────────────────────────────────────┐
│                     DeepAgent (Orchestrator)                         │
│                                                                      │
│  EventBus ─ ApprovalMgr ─ TokenTracker ─ ContextMgr ─ PluginMgr    │
└──────┬──────────────┬──────────────┬──────────────┬─────────────────┘
       │              │              │              │
  ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
  │  Ports  │   │   Ports   │  │  Ports  │  │   Ports   │
  │(inbound)│   │ (outbound)│  │(observe)│  │ (infra)   │
  ├─────────┤   ├───────────┤  ├─────────┤  ├───────────┤
  │PluginPort│  │Filesystem │  │Tracing  │  │RuntimePort│
  │ModelPort │  │MemoryPort │  │Metrics  │  │Validation │
  │Consensus │  │McpPort    │  │Logging  │  │TokenCount │
  │          │  │LearningPt │  │         │  │           │
  └────┬────┘  └─────┬─────┘  └────┬────┘  └─────┬─────┘
       │              │              │              │
  ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
  │Adapters │   │ Adapters  │  │Adapters │  │ Adapters  │
  ├─────────┤   ├───────────┤  ├─────────┤  ├───────────┤
  │BasePlugin│  │VirtualFS  │  │InMemory │  │NodeRuntime│
  │Guardrails│  │LocalFS    │  │ Tracing │  │DenoRuntime│
  │Workflow  │  │InMemoryMem│  │InMemory │  │BunRuntime │
  │Observ.   │  │Supabase   │  │ Metrics │  │EdgeRuntime│
  │OneCrawl  │  │AiSdkMcp   │  │Console  │  │ZodValid. │
  │Vectorless│  │GaussFlowMcp│  │ Logging │  │Approximate│
  │Evals     │  │InMemLearn │  │         │  │Tiktoken   │
  │A2A       │  │           │  │         │  │           │
  └────┬────┘  └───────────┘  └─────────┘  └───────────┘
       │
  ┌────▼────────────────────────┐
  │          Tools              │
  │ ls, read, write, edit,     │
  │ glob, grep, todos, task,   │
  │ scrape, search, generate,  │
  │ query, mcp:*               │
  └────────────────────────────┘
       │
  ┌────▼────────────────────────┐
  │     AgentGraph (DAG)        │
  │ node() → edge() → fork()   │
  │ consensus strategies        │
  │ streaming events            │
  └────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Port** | Interface contract (e.g. `FilesystemPort`, `TracingPort`) — no implementation details |
| **Adapter** | Concrete implementation of a port (e.g. `VirtualFilesystem`, `InMemoryTracingAdapter`) |
| **Plugin** | Extends agent behavior via lifecycle hooks and/or tool injection |
| **AbstractBuilder** | Template method pattern ensuring `validate()` before `construct()` |
| **BasePlugin** | Abstract class providing `name`, `version`, and `buildHooks()` skeleton |

### Package Structure

```
src/
  index.ts                    Public API surface
  types.ts                    Shared type definitions
  ports/
    filesystem.port.ts        FilesystemPort interface
    memory.port.ts            MemoryPort interface
    mcp.port.ts               McpPort interface
    model.port.ts             ModelPort interface
    plugin.port.ts            Plugin contracts and lifecycle hooks
    token-counter.port.ts     TokenCounterPort interface
    learning.port.ts          LearningPort interface
    runtime.port.ts           RuntimePort interface
    validation.port.ts        ValidationPort interface
    tracing.port.ts           TracingPort / Span interfaces
    metrics.port.ts           MetricsPort interface
    logging.port.ts           LoggingPort / LogLevel / LogEntry
    consensus.port.ts         ConsensusPort for fork evaluation
    partial-json.port.ts      PartialJsonPort / JsonAccumulator interfaces
    tool-composition.port.ts  ToolCompositionPort / ToolPipeline / ToolMiddleware
  adapters/
    filesystem/
      virtual-fs.adapter.ts   In-memory VFS with optional disk sync
      local-fs.adapter.ts     Sandboxed Node.js fs wrapper
    memory/
      in-memory.adapter.ts    Map-based in-process storage
      supabase.adapter.ts     Supabase-backed persistent storage
    mcp/
      ai-sdk-mcp.adapter.ts   @ai-sdk/mcp client bridge
      gaussflow-mcp.adapter.ts @giulio-leone/gaussflow-mcp registry bridge
    token-counter/
      approximate.adapter.ts  Character-ratio estimation (~4 chars/token)
      tiktoken.adapter.ts     BPE-accurate counting via tiktoken
    partial-json/
      default-partial-json.adapter.ts  Incremental JSON parser for LLM streams
    tool-composition/
      default-tool-composition.adapter.ts  Pipe, fallback, and middleware for tools
    learning/
      in-memory-learning.adapter.ts  Map-based learning storage
    runtime/
      base-runtime.adapter.ts Base runtime adapter
      node-runtime.adapter.ts Node.js runtime (process.env)
      deno-runtime.adapter.ts Deno runtime (Deno.env.get)
      bun-runtime.adapter.ts  Bun runtime (process.env)
      edge-runtime.adapter.ts Edge/CF Workers runtime
      detect-runtime.ts       Auto-detection + factory
    validation/
      zod-validation.adapter.ts  Zod-based ValidationPort implementation
    tracing/
      in-memory-tracing.adapter.ts  In-memory span storage
    metrics/
      in-memory-metrics.adapter.ts  In-memory counters/histograms/gauges
    logging/
      console-logging.adapter.ts    Console-based structured logging
    consensus/
      llm-judge.adapter.ts    LLM-based consensus evaluation
      majority-vote.adapter.ts Simple majority vote consensus
      debate.adapter.ts       Multi-round debate consensus
  agent/
    deep-agent.ts             DeepAgent class and DeepAgentBuilder
    agent-config.ts           Default configs and resolvers
    approval-manager.ts       Tool-call approval logic
    event-bus.ts              Typed event emitter
    stop-conditions.ts        Reusable stop predicates
  plugins/
    base.plugin.ts            Abstract base class for plugins
    plugin-manager.ts         Plugin lifecycle + deterministic hook execution
    agent-card.plugin.ts      AgentCard generation and serving
    a2a.plugin.ts             A2A integration plugin
    a2a-handler.ts            JSON-RPC A2A request handler
    guardrails.plugin.ts      Input/output validation and content filtering
    onecrawl.plugin.ts        OneCrawl web scraping integration
    vectorless.plugin.ts      Vectorless RAG/knowledge integration
    evals.plugin.ts           Evaluation metrics collection
    workflow.plugin.ts        Multi-step workflow with retry/rollback
    observability.plugin.ts   Tracing + metrics + logging plugin
  tools/
    filesystem/               ls, read_file, write_file, edit_file, glob, grep
    planning/                 write_todos, review_todos
    subagent/                 task (spawn child agent)
  context/
    context-manager.ts        Offloading and truncation
    rolling-summarizer.ts     LLM-based conversation compression
    token-tracker.ts          Cumulative usage tracking
  graph/
    agent-graph.ts            AgentGraph class and AgentGraphBuilder
    agent-node.ts             Graph node wrapper
    graph-executor.ts         DAG execution engine
    shared-context.ts         Shared filesystem context for graph nodes
  streaming/
    event-stream.ts           Event stream utilities
    sse-handler.ts            Server-Sent Events handler
    ws-handler.ts             WebSocket handler
    delta-encoder.ts          Delta encoding for efficient streaming
    stream-json.ts            streamJson<T>() async generator
    graph-stream.ts           Graph event streaming
  domain/
    todo.schema.ts            Todo Zod schemas
    checkpoint.schema.ts      Checkpoint Zod schemas
    conversation.schema.ts    Message and conversation schemas
    events.schema.ts          Event type schemas
    learning.schema.ts        Learning Zod schemas
    eval.schema.ts            Evaluation Zod schemas
    workflow.schema.ts        Workflow step, context, result schemas
    graph.schema.ts           Graph configuration and result schemas
  utils/
    abstract-builder.ts       Template method builder base class
  templates/
    prompt-template.ts        PromptTemplate with conditionals, loops, filters, partials
```

## API Reference

### DeepAgent

The main orchestrator class. Use the static factory methods to create instances.

#### Static Factories

##### `DeepAgent.create(config): DeepAgentBuilder`

Returns a builder for full control over agent composition.

```typescript
const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a project manager.",
})
  .withPlanning()
  .withSubagents()
  .withMaxSteps(50)
  .build();
```

##### `DeepAgent.minimal(config): DeepAgent`

Creates an agent with planning enabled, using default adapters (VirtualFilesystem, InMemoryAdapter, ApproximateTokenCounter). Equivalent to `DeepAgent.create(config).withPlanning().build()`.

```typescript
const agent = DeepAgent.minimal({
  model: openai("gpt-4o"),
  instructions: "Complete the task.",
});
```

##### `DeepAgent.full(config): DeepAgent`

Creates a fully-featured agent with planning, subagents, and optional memory/MCP/token counter overrides.

```typescript
import { SupabaseMemoryAdapter } from "@giulio-leone/gaussflow-agent";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(url, key);

const agent = DeepAgent.full({
  model: openai("gpt-4o"),
  instructions: "You are a senior engineer.",
  memory: new SupabaseMemoryAdapter(supabase),
  mcp: mcpAdapter,
  tokenCounter: tiktokenCounter,
});
```

#### Instance Methods

##### `.run(prompt): Promise<DeepAgentResult>`

Executes the agent loop with the given prompt. Returns when the agent completes or reaches `maxSteps`.

```typescript
interface DeepAgentResult {
  text: string;       // Final assistant response
  steps: unknown[];   // All intermediate steps
  sessionId: string;  // Unique session identifier
}
```

##### `.dispose(): Promise<void>`

Closes MCP connections and removes all event listeners. Call when the agent is no longer needed.

### DeepAgentBuilder

Fluent builder returned by `DeepAgent.create()`.

| Method | Description |
|--------|-------------|
| `.withFilesystem(fs)` | Provide a custom `FilesystemPort` implementation |
| `.withMemory(memory)` | Provide a custom `MemoryPort` implementation |
| `.withLearning(learning, userId?)` | Provide a `LearningPort` for cross-session learning |
| `.withRuntime(runtime)` | Provide a custom `RuntimePort` (auto-detected by default) |
| `.withTokenCounter(counter)` | Provide a custom `TokenCounterPort` implementation |
| `.withMcp(mcp)` | Provide a `McpPort` for MCP tool integration |
| `.withCircuitBreaker(breaker)` | Enable circuit breaker pattern for resilience |
| `.withRateLimiter(limiter)` | Enable rate limiting with token bucket algorithm |
| `.withToolCache(cache)` | Enable LRU caching of tool execution results |
| `.withPlanning()` | Enable planning tools (`write_todos`, `review_todos`) |
| `.withSubagents(config?)` | Enable the `task` tool for spawning subagents |
| `.withApproval(config?)` | Enable human-in-the-loop approval for tool calls |
| `.withMaxSteps(n)` | Override the maximum number of agent loop steps |
| `.use(plugin)` | Register a plugin (hooks + optional tool injection) |
| `.on(event, handler)` | Register an event handler before building |
| `.build()` | Construct the `DeepAgent` instance |

All methods return `this` for chaining. Defaults are applied for any adapter not explicitly provided:

| Adapter | Default |
|---------|---------|
| Filesystem | `VirtualFilesystem` |
| Memory | `InMemoryAdapter` |
| Token Counter | `ApproximateTokenCounter` |
| Max Steps | `30` |

### Plugin System

Plugins are executed in **registration order** and can participate in a deterministic lifecycle:

- `beforeRun` / `afterRun`
- `beforeTool` / `afterTool`
- `beforeStep` / `afterStep`
- `onError`

Plugins can also inject tools by exposing a `tools` map.

```typescript
import type { DeepAgentPlugin } from "@giulio-leone/gaussflow-agent";

const observabilityPlugin: DeepAgentPlugin = {
  name: "observability",
  hooks: {
    beforeRun: async (_ctx, params) => ({
      prompt: `[trace] ${params.prompt}`,
    }),
    afterRun: async (_ctx, params) => {
      console.log("Final output length:", params.result.text.length);
    },
  },
};

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a release engineer.",
})
  .use(observabilityPlugin)
  .build();
```

#### Built-in Plugins

| Plugin | Description |
|--------|-------------|
| `AgentCardPlugin` | Resolves `agents.md` / `skills.md` with priority `manual file > override > auto-generated` |
| `A2APlugin` | Exposes an A2A JSON-RPC handler and adds the `a2a:call` tool for remote A2A agents |
| `GuardrailsPlugin` | Input/output validation with Zod schemas, content filtering, and PII detection |
| `WorkflowPlugin` | Multi-step workflow execution with retry, rollback, and conditional steps |
| `ObservabilityPlugin` | Three-pillar observability: distributed tracing, metrics, and structured logging |
| `OneCrawlPlugin` | Web scraping and search tools via `onecrawl` (tools: `scrape`, `search`, `batch`) |
| `VectorlessPlugin` | RAG/knowledge tools via `@giulio-leone/gaussflow-vectorless` (tools: `generate`, `query`, `search-entities`, `list`) |
| `EvalsPlugin` | Evaluation metrics: latency, tokens, tool usage, custom scorers |

`A2APlugin` can consume `AgentCardPlugin` as a discovery provider:

```typescript
import {
  DeepAgent,
  AgentCardPlugin,
  A2APlugin,
} from "@giulio-leone/gaussflow-agent";

const agentCard = new AgentCardPlugin();
const a2a = new A2APlugin({ agentCardProvider: agentCard });

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "Coordinate infra operations across distributed agents.",
})
  .use(agentCard)
  .use(a2a)
  .build();

const a2aHttpHandler = a2a.createHttpHandler(agent);
```

#### GuardrailsPlugin

Input/output validation and content filtering:

```typescript
import { DeepAgent, createGuardrailsPlugin, createPiiFilter } from "@giulio-leone/gaussflow-agent";
import { z } from "zod";

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant.",
})
  .use(createGuardrailsPlugin({
    inputSchema: z.string().min(1).max(10000),
    outputSchema: z.string().max(50000),
    contentFilters: [createPiiFilter()],
    toolSchemas: {
      write_file: z.object({ path: z.string(), content: z.string().max(100000) }),
    },
    onFailure: "throw", // or "warn"
  }))
  .build();
```

#### OneCrawlPlugin

Web scraping and search tools:

```typescript
import { DeepAgent, createOneCrawlPlugin } from "@giulio-leone/gaussflow-agent";

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You can search and scrape the web.",
})
  .use(createOneCrawlPlugin({
    maxContentLength: 10000,
    timeout: 30000,
  }))
  .build();
// Adds tools: scrape, search, batch
```

#### Semantic Scraping & Tool Manifests

The `SemanticScrapingAdapter` provides incremental, per-site tool manifests with cross-page deduplication:

```typescript
import { SemanticScrapingAdapter } from "@giulio-leone/gaussflow-agent/scraping";

const adapter = new SemanticScrapingAdapter();

// Add tools discovered on a page
adapter.updatePage("example.com", "https://example.com/products", tools);

// Incremental diff (add/remove without full rescan)
adapter.applyDiff("example.com", url, addedTools, removedNames);

// Export as MCP-compatible JSON
const json = adapter.toMCPJson("example.com");

// Query tools for a specific URL pattern
const pageTools = adapter.getToolsForUrl("example.com", "/products/123");
```

Used by the OneGenUI Chrome extension to persist tool manifests in IndexedDB and expose them via DOM injection (`<script type="application/wmcp+json">`).

#### VectorlessPlugin

RAG/knowledge extraction tools (no vector database needed):

```typescript
import { DeepAgent, createVectorlessPlugin } from "@giulio-leone/gaussflow-agent";

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You can extract and query knowledge from text.",
})
  .use(createVectorlessPlugin())
  .build();
// Adds tools: generate, query, search-entities, list
```

#### EvalsPlugin

Evaluation metrics collection:

```typescript
import { DeepAgent, createEvalsPlugin } from "@giulio-leone/gaussflow-agent";

const evals = createEvalsPlugin({
  persist: true,
  scorers: [
    { name: "length", score: (_prompt, output) => Math.min(output.length / 1000, 1) },
  ],
  onEval: (result) => console.log(`Latency: ${result.metrics.latencyMs}ms`),
});

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant.",
})
  .use(evals)
  .build();

await agent.run("Hello");
console.log(evals.getLastResult()); // { metrics: { latencyMs, stepCount, toolCalls, ... } }
```

#### WorkflowPlugin

Multi-step workflow execution with automatic retry, rollback on failure, and conditional step skipping:

```typescript
import { DeepAgent, createWorkflowPlugin } from "@giulio-leone/gaussflow-agent";
import type { WorkflowStep } from "@giulio-leone/gaussflow-agent";

const steps: WorkflowStep[] = [
  {
    id: "fetch-data",
    name: "Fetch Data",
    execute: async (ctx) => {
      const res = await fetch("https://api.example.com/data");
      return { ...ctx, data: await res.json() };
    },
    rollback: async (ctx) => {
      console.log("Rolling back fetch-data");
    },
    retry: { maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2 },
  },
  {
    id: "transform",
    name: "Transform",
    condition: (ctx) => ctx.data != null, // Skip if no data
    execute: async (ctx) => ({ ...ctx, transformed: true }),
  },
];

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "Process the workflow results.",
})
  .use(createWorkflowPlugin({ steps, initialContext: { env: "prod" } }))
  .build();
```

**Key API:**

| Type | Description |
|------|-------------|
| `WorkflowStep` | `{ id, name, execute, rollback?, condition?, retry? }` |
| `WorkflowContext` | `Record<string, unknown>` — shared mutable context between steps |
| `WorkflowResult` | `{ status, context, completedSteps, skippedSteps, failedStep?, error?, totalDurationMs }` |
| `RetryConfig` | `{ maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2 }` |

#### ObservabilityPlugin

Three-pillar observability integrating `TracingPort`, `MetricsPort`, and `LoggingPort`:

```typescript
import {
  DeepAgent,
  createObservabilityPlugin,
  InMemoryTracingAdapter,
  InMemoryMetricsAdapter,
  ConsoleLoggingAdapter,
} from "@giulio-leone/gaussflow-agent";

const tracer = new InMemoryTracingAdapter();
const metrics = new InMemoryMetricsAdapter();
const logger = new ConsoleLoggingAdapter();

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant.",
})
  .use(createObservabilityPlugin({ tracer, metrics, logger }))
  .build();

await agent.run("Hello");
// Tracer: spans for agent.run and each tool.* call
// Metrics: agent.runs.total, agent.runs.success, agent.tools.total, agent.tool.duration.ms
// Logger: structured logs with sessionId context at debug/info/error levels
```

**Observability Ports:**

| Port | Methods |
|------|---------|
| `TracingPort` | `startSpan(name, parentSpan?): Span` |
| `MetricsPort` | `incrementCounter(name, value?, labels?)`, `recordHistogram(name, value, labels?)`, `recordGauge(name, value, labels?)` |
| `LoggingPort` | `log(level, message, context?)`, `debug()`, `info()`, `warn()`, `error()` |

**Span interface:** `traceId`, `spanId`, `name`, `setAttribute()`, `setStatus()`, `end()`

### BasePlugin

Abstract base class for building plugins. Subclasses provide `name` and implement `buildHooks()`:

```typescript
import { BasePlugin } from "@giulio-leone/gaussflow-agent";
import type { PluginHooks, PluginContext, BeforeRunParams, BeforeRunResult } from "@giulio-leone/gaussflow-agent";

class TimingPlugin extends BasePlugin {
  readonly name = "timing";
  private startTime = 0;

  protected buildHooks(): PluginHooks {
    return {
      beforeRun: async (_ctx: PluginContext, _params: BeforeRunParams) => {
        this.startTime = Date.now();
      },
      afterRun: async () => {
        console.log(`Run took ${Date.now() - this.startTime}ms`);
      },
    };
  }
}

const agent = DeepAgent.create({ model, instructions: "..." })
  .use(new TimingPlugin())
  .build();
```

### AbstractBuilder

Template method pattern for validated builders. Subclasses implement `validate()` and `construct()`:

```typescript
import { AbstractBuilder } from "@giulio-leone/gaussflow-agent";

interface AppConfig {
  name: string;
  port: number;
}

class AppConfigBuilder extends AbstractBuilder<AppConfig> {
  private name = "";
  private port = 3000;

  withName(name: string): this { this.name = name; return this; }
  withPort(port: number): this { this.port = port; return this; }

  protected validate(): void {
    if (!this.name) throw new Error("name is required");
    if (this.port < 1 || this.port > 65535) throw new Error("invalid port");
  }

  protected construct(): AppConfig {
    return { name: this.name, port: this.port };
  }
}

const config = new AppConfigBuilder()
  .withName("my-app")
  .withPort(8080)
  .build(); // Calls validate() then construct()
```

Used internally by `DeepAgentBuilder` and `AgentGraphBuilder`.

### ValidationPort

Engine-agnostic validation contract. The framework ships with `ZodValidationAdapter` (default):

```typescript
import { ZodValidationAdapter } from "@giulio-leone/gaussflow-agent";
import type { ValidationPort, ValidationResult } from "@giulio-leone/gaussflow-agent";
import { z } from "zod";

const validator: ValidationPort = new ZodValidationAdapter();

// Safe validation
const result: ValidationResult<string> = validator.validate(z.string().email(), "user@example.com");
if (result.success) {
  console.log(result.data); // "user@example.com"
}

// Throwing validation
const email = validator.validateOrThrow(z.string().email(), "user@example.com");
```

**Interface:**

```typescript
interface ValidationPort {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T>;
  validateOrThrow<T>(schema: unknown, data: unknown): T;
}

interface ValidationResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}
```

To use a different validation engine (Yup, Joi, etc.), implement `ValidationPort` and pass it to plugins via their options.

### Tools

Tools are automatically registered based on builder configuration.

#### Filesystem Tools

Always included. Created via `createFilesystemTools(fs)`.

| Tool | Description |
|------|-------------|
| `ls` | List directory contents |
| `read_file` | Read file content as string |
| `write_file` | Write content to a file, creating directories as needed |
| `edit_file` | Apply targeted string replacements to a file |
| `glob` | Find files matching a glob pattern |
| `grep` | Search file contents by regex pattern |

Individual tool factories are also exported: `createLsTool`, `createReadFileTool`, `createWriteFileTool`, `createEditFileTool`, `createGlobTool`, `createGrepTool`.

#### Planning Tools

Enabled via `.withPlanning()`. Created via `createPlanningTools(fs)`.

| Tool | Description |
|------|-------------|
| `write_todos` | Create or update a structured list of todos |
| `review_todos` | Review current todo status and dependencies |

Todos are stored as JSON in the persistent filesystem zone. Each todo has an `id`, `title`, `description`, `status` (pending/in_progress/done/blocked), `dependencies`, and `priority` (low/medium/high/critical).

#### Subagent Tool

Enabled via `.withSubagents(config?)`. Created via `createSubagentTools(config)`.

| Tool | Description |
|------|-------------|
| `task` | Spawn a child `ToolLoopAgent` with its own filesystem tools to handle a subtask |

The subagent receives a prompt and optional instructions, runs with its own step limit, and returns its findings to the parent agent.

```typescript
interface TaskToolConfig {
  parentModel: LanguageModel;
  parentFilesystem: FilesystemPort;
  maxDepth?: number;      // Default: 3
  timeoutMs?: number;     // Default: 300000 (5 min)
  currentDepth?: number;
}
```

### Ports

Port interfaces define the contracts for hexagonal architecture. Implement these to provide custom adapters.

#### ModelPort

LLM invocation abstraction.

```typescript
interface ModelPort {
  getModel(): LanguageModel;
  getContextWindowSize(): number;
  getModelId(): string;
  generate(options: ModelGenerateOptions): Promise<ModelGenerateResult>;
  generateStream?(options: ModelGenerateOptions): Promise<ModelStreamResult>;
}
```

#### FilesystemPort

File operations with zone-based isolation (`transient` or `persistent`).

```typescript
interface FilesystemPort {
  read(path: string, zone?: FilesystemZone): Promise<string>;
  write(path: string, content: string, zone?: FilesystemZone): Promise<void>;
  exists(path: string, zone?: FilesystemZone): Promise<boolean>;
  delete(path: string, zone?: FilesystemZone): Promise<void>;
  list(path: string, options?: ListOptions, zone?: FilesystemZone): Promise<FileEntry[]>;
  search(pattern: string, options?: SearchOptions, zone?: FilesystemZone): Promise<SearchResult[]>;
  glob(pattern: string, zone?: FilesystemZone): Promise<string[]>;
  stat(path: string, zone?: FilesystemZone): Promise<FileStat>;
  syncToPersistent?(): Promise<void>;
  clearTransient?(): Promise<void>;
}
```

#### MemoryPort

Persistent state storage for todos, checkpoints, conversations, and arbitrary metadata.

```typescript
interface MemoryPort {
  saveTodos(sessionId: string, todos: Todo[]): Promise<void>;
  loadTodos(sessionId: string): Promise<Todo[]>;
  saveCheckpoint(sessionId: string, checkpoint: Checkpoint): Promise<void>;
  loadLatestCheckpoint(sessionId: string): Promise<Checkpoint | null>;
  listCheckpoints(sessionId: string): Promise<Checkpoint[]>;
  deleteOldCheckpoints(sessionId: string, keepCount: number): Promise<void>;
  saveConversation(sessionId: string, messages: Message[]): Promise<void>;
  loadConversation(sessionId: string): Promise<Message[]>;
  saveMetadata(sessionId: string, key: string, value: unknown): Promise<void>;
  loadMetadata<T>(sessionId: string, key: string): Promise<T | null>;
  deleteMetadata(sessionId: string, key: string): Promise<void>;
}
```

#### RuntimePort

Platform-agnostic runtime abstraction. Auto-detected or explicitly set with `.withRuntime()`.

```typescript
interface RuntimePort {
  randomUUID(): string;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  getEnv(key: string): string | undefined;
  setTimeout(callback: () => void, ms: number): { clear(): void };
}
```

#### LearningPort

Cross-session learning with user profiles, memories, and shared knowledge.

```typescript
interface LearningPort {
  getProfile(userId: string): Promise<UserProfile | null>;
  updateProfile(userId: string, updates: Partial<Omit<UserProfile, "userId" | "createdAt">>): Promise<UserProfile>;
  deleteProfile(userId: string): Promise<void>;
  
  addMemory(userId: string, memory: Omit<UserMemoryInput, "id" | "createdAt">): Promise<UserMemory>;
  getMemories(userId: string, options?: { tags?: string[]; limit?: number; since?: number }): Promise<UserMemory[]>;
  deleteMemory(userId: string, memoryId: string): Promise<void>;
  clearMemories(userId: string): Promise<void>;
  
  addKnowledge(knowledge: Omit<SharedKnowledgeInput, "id" | "createdAt" | "usageCount">): Promise<SharedKnowledge>;
  queryKnowledge(query: string, options?: { category?: string; limit?: number }): Promise<SharedKnowledge[]>;
  incrementKnowledgeUsage(knowledgeId: string): Promise<void>;
  deleteKnowledge(knowledgeId: string): Promise<void>;
}
```

```typescript
import { DeepAgent, InMemoryLearningAdapter } from "@giulio-leone/gaussflow-agent";

const learning = new InMemoryLearningAdapter();
await learning.updateProfile("user-1", { style: "concise", language: "en" });
await learning.addMemory("user-1", { content: "Prefers TypeScript", tags: ["preference"] });

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant.",
})
  .withLearning(learning, "user-1")
  .build();
// Learning context is automatically injected into run() and stream()
```

#### McpPort

MCP server discovery and tool execution.

```typescript
interface McpPort {
  discoverTools(): Promise<Record<string, McpToolDefinition>>;
  executeTool(name: string, args: unknown): Promise<McpToolResult>;
  listServers(): Promise<McpServerInfo[]>;
  connect(config: McpServerConfig): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  closeAll(): Promise<void>;
}
```

MCP tools are registered with a `mcp:` namespace prefix (e.g., `mcp:web_search`).

#### TokenCounterPort

Token counting, budgeting, and cost estimation.

```typescript
interface TokenCounterPort {
  count(text: string, model?: string): number;
  countMessages(messages: Message[], model?: string): number;
  getContextWindowSize(model: string): number;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
  truncate(text: string, maxTokens: number, model?: string): string;
}
```

#### ValidationPort

Engine-agnostic validation contract. Used by `GuardrailsPlugin`, `OneCrawlPlugin`, and `VectorlessPlugin`.

```typescript
interface ValidationPort {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T>;
  validateOrThrow<T>(schema: unknown, data: unknown): T;
}
```

#### TracingPort

Distributed tracing contract for span-based instrumentation.

```typescript
interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly name: string;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: "ok" | "error", message?: string): void;
  end(): void;
}

interface TracingPort {
  startSpan(name: string, parentSpan?: Span): Span;
}
```

#### MetricsPort

Metrics collection contract for counters, histograms, and gauges.

```typescript
interface MetricsPort {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  recordGauge(name: string, value: number, labels?: Record<string, string>): void;
}
```

#### LoggingPort

Structured logging contract with log levels.

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggingPort {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
```

#### ConsensusPort

Strategy for evaluating fork results in `AgentGraph`.

```typescript
interface ConsensusPort {
  evaluate(results: Array<{ id: string; output: string }>): Promise<ConsensusResult>;
}

interface ConsensusResult {
  winnerId: string;
  winnerOutput: string;
  scores?: Record<string, number>;
  merged?: string;
  reasoning?: string;
}
```

### Adapters

#### Filesystem

| Adapter | Description |
|---------|-------------|
| `VirtualFilesystem` | In-memory filesystem with optional disk persistence via `syncToPersistent()`. Supports transient and persistent zones. Default adapter. |
| `LocalFilesystem` | Sandboxed wrapper over Node.js `fs`. Restricts operations to a configured base path. |

#### Memory

| Adapter | Description |
|---------|-------------|
| `InMemoryAdapter` | `Map`-based in-process storage. Suitable for testing and ephemeral sessions. Default adapter. |
| `SupabaseMemoryAdapter` | Supabase-backed storage using `deep_agent_todos`, `deep_agent_checkpoints`, `deep_agent_conversations`, and `deep_agent_metadata` tables. |

#### Learning

| Adapter | Description |
|---------|-------------|
| `InMemoryLearningAdapter` | `Map`-based in-process learning storage. Suitable for testing and ephemeral sessions. |

#### Runtime

| Adapter | Description |
|---------|-------------|
| `NodeRuntimeAdapter` | Node.js runtime. Uses `process.env` for environment variables. |
| `DenoRuntimeAdapter` | Deno runtime. Uses `Deno.env.get()` for environment variables. |
| `BunRuntimeAdapter` | Bun runtime. Uses `process.env` (Node-compatible). |
| `EdgeRuntimeAdapter` | Edge/Cloudflare Workers. Env vars bound via request context. |

#### Token Counter

| Adapter | Description |
|---------|-------------|
| `ApproximateTokenCounter` | Fast estimation using ~4 characters per token. Includes context window sizes for common models. Default adapter. |
| `TiktokenTokenCounter` | BPE-accurate counting via the `tiktoken` library. Falls back to `ApproximateTokenCounter` when tiktoken is unavailable. |

#### MCP

| Adapter | Description |
|---------|-------------|
| `AiSdkMcpAdapter` | Bridges `@ai-sdk/mcp` clients to the `McpPort` interface. Supports stdio, HTTP, and SSE transports. |
| `GaussFlowMcpAdapter` | Bridges `@giulio-leone/gaussflow-mcp` `McpRegistry` to the `McpPort` interface. |

#### Validation

| Adapter | Description |
|---------|-------------|
| `ZodValidationAdapter` | Zod-based implementation of `ValidationPort`. Default validation engine. |

#### Tracing

| Adapter | Description |
|---------|-------------|
| `InMemoryTracingAdapter` | In-memory span storage. Useful for testing and development. |

#### Metrics

| Adapter | Description |
|---------|-------------|
| `InMemoryMetricsAdapter` | In-memory counters, histograms, and gauges. Useful for testing. |

#### Logging

| Adapter | Description |
|---------|-------------|
| `ConsoleLoggingAdapter` | Structured logging via `console.log/warn/error`. |

#### Consensus

| Adapter | Description |
|---------|-------------|
| `LlmJudgeConsensus` | LLM-based evaluation of fork results. Uses a model to pick the best output. |
| `MajorityVoteConsensus` | Simple majority vote across fork outputs. |
| `DebateConsensus` | Multi-round debate between fork outputs for consensus. |

### Events

Subscribe to lifecycle events via the builder's `.on()` method or directly on `agent.eventBus`.

```typescript
const agent = DeepAgent.create(config)
  .withPlanning()
  .on("tool:call", (event) => {
    console.log(`Tool called: ${event.data.toolName}`);
  })
  .on("*", (event) => {
    // Wildcard: receives all events
  })
  .build();
```

Every event has the shape:

```typescript
interface AgentEvent<T = unknown> {
  type: AgentEventType;
  timestamp: number;
  sessionId: string;
  data: T;
}
```

#### Event Types

| Event | Description |
|-------|-------------|
| `agent:start` | Agent run begins |
| `agent:stop` | Agent run completes |
| `step:start` | A step in the tool loop begins |
| `step:end` | A step in the tool loop ends |
| `tool:call` | A tool is invoked |
| `tool:result` | A tool returns a result |
| `tool:approval-required` | A tool call requires human approval |
| `tool:approved` | A tool call was approved |
| `tool:denied` | A tool call was denied |
| `checkpoint:save` | A checkpoint was persisted |
| `checkpoint:load` | A checkpoint was restored |
| `context:summarize` | Conversation was summarized to reduce tokens |
| `context:offload` | A large tool result was offloaded to the VFS |
| `context:truncate` | Messages were truncated to fit the context window |
| `subagent:spawn` | A subagent was spawned via the `task` tool |
| `subagent:complete` | A subagent finished execution |
| `planning:update` | The todo list was updated |
| `error` | An error occurred during execution |

### Context Management

The framework automatically manages the LLM context window through three mechanisms:

#### Tool-Result Offloading

When a tool result exceeds `offloadTokenThreshold` (default: 20,000 tokens), the `ContextManager` writes it to the transient VFS zone and replaces the inline result with a file reference. The agent can read the full content via `read_file` when needed.

#### Rolling Summarization

When conversation messages exceed `summarizationThreshold` (default: 70% of context window), the `RollingSummarizer` compresses older messages into a summary using a dedicated LLM call. Recent messages (configurable via `preserveRecentMessages`, default: 10) are always preserved.

#### Message Truncation

When messages exceed `truncationThreshold` (default: 85% of context window), the `ContextManager` drops the oldest non-system messages to fit within budget. System messages are always preserved.

#### Token Tracking

The `TokenTracker` accumulates input and output token usage across the session, providing budget awareness and cost estimation.

## Template Engine

`PromptTemplate` provides Handlebars-style templating for dynamic prompt construction with conditionals, loops, filters, and partials.

### Syntax

| Feature | Syntax |
|---------|--------|
| Variables | `{{name}}` |
| Conditionals | `{{#if condition}}...{{else}}...{{/if}}` |
| Unless | `{{#unless condition}}...{{else}}...{{/unless}}` |
| Loops | `{{#each items}}{{this}} / {{@index}} / {{this.prop}}{{/each}}` |
| Filters | `{{variable \| uppercase}}`, `{{variable \| lowercase}}`, `{{variable \| trim}}`, `{{variable \| default('fallback')}}` |
| Partials | `{{>partialName}}` |

Nested blocks are fully supported — conditionals inside loops, loops inside conditionals, etc.

### `requiredVariables`

The `requiredVariables` getter introspects the template and returns all variable names (from `{{var}}`, block tags, and filter expressions) sorted alphabetically:

```typescript
const tpl = PromptTemplate.from("Hello {{name}}, you have {{count}} items.");
console.log(tpl.requiredVariables); // ["count", "name"]
```

### Example

```typescript
import { PromptTemplate } from "@giulio-leone/gaussflow-agent";

const prompt = new PromptTemplate({
  template: `You are a {{role | uppercase}} assistant.
{{#if context}}Use this context: {{context}}{{/if}}
{{#each tools}}
- {{@index}}. {{this.name}}: {{this.description}}
{{/each}}
{{#unless verbose}}Be concise.{{/unless}}`,
  variables: {
    role: "coding",
    context: "TypeScript project",
    tools: [
      { name: "grep", description: "Search files" },
      { name: "edit", description: "Edit files" },
    ],
    verbose: false,
  },
});

const result = prompt.compile();
```

## Partial JSON Streaming

Parse incomplete JSON from LLM streaming responses as they arrive, yielding typed partial objects incrementally.

### Components

| Export | Description |
|--------|-------------|
| `DefaultPartialJsonAdapter` | Adapter that repairs and parses incomplete JSON strings |
| `streamJson<T>()` | Async generator that yields `Partial<T>` objects from a token stream |
| `JsonAccumulator<T>` | Stateful accumulator — feed chunks via `.push()`, read via `.current()` |

### Example

```typescript
import { streamJson } from "@giulio-leone/gaussflow-agent";

interface ToolCall {
  name: string;
  args: Record<string, string>;
}

// tokens is an AsyncIterable<string> from your LLM stream
for await (const partial of streamJson<ToolCall>(tokens)) {
  console.log(partial);
  // { name: "grep" }
  // { name: "grep", args: {} }
  // { name: "grep", args: { pattern: "TODO" } }
}
```

Lower-level usage with `JsonAccumulator`:

```typescript
import { DefaultPartialJsonAdapter } from "@giulio-leone/gaussflow-agent";

const adapter = DefaultPartialJsonAdapter.create();
const accumulator = adapter.createAccumulator<{ status: string }>();

accumulator.push('{"statu');
accumulator.push('s":"ok"}');

console.log(accumulator.current());    // { status: "ok" }
console.log(accumulator.isComplete()); // true
```

## Tool Composition Pipeline

Compose, chain, and wrap AI SDK tools using a fluent pipeline API with sequential execution, automatic fallbacks, and middleware hooks.

### API

| Method | Description |
|--------|-------------|
| `.pipe(["tool1", "tool2"])` | Sequential execution — output of each tool feeds into the next |
| `.withFallback("primary", "backup")` | If `primary` throws, automatically retry with `backup` |
| `.withMiddleware(middleware)` | Register `before`, `after`, and `onError` hooks on every tool |

### Example

```typescript
import { DefaultToolCompositionAdapter } from "@giulio-leone/gaussflow-agent";
import type { ToolMiddleware } from "@giulio-leone/gaussflow-agent";

const composer = new DefaultToolCompositionAdapter();
const tools = { /* your AI SDK tools */ };

const logging: ToolMiddleware = {
  name: "logging",
  before: async (toolName, args) => {
    console.log(`[${toolName}] called with`, args);
    return args;
  },
  after: async (toolName, result) => {
    console.log(`[${toolName}] returned`, result);
    return result;
  },
  onError: async (toolName, error) => {
    console.error(`[${toolName}] failed:`, error.message);
    return null; // re-throw; return a value to swallow the error
  },
};

const composed = composer
  .createPipeline(tools)
  .pipe(["fetch_data", "transform", "save"])
  .withFallback("fetch_data", "fetch_data_cached")
  .withMiddleware(logging)
  .build();
```

## Examples

- `examples/01-basic-agent.ts` — minimal planning agent
- `examples/02-planning-agent.ts` — structured todo workflow
- `examples/03-subagent-orchestration.ts` — parent/child delegation
- `examples/04-mcp-integration.ts` — MCP tool federation
- `examples/05-persistent-memory.ts` — persistent session state
- `examples/06-full-featured.ts` — full stack composition
- `examples/07-plugin-system.ts` — custom plugin + AgentCardPlugin
- `examples/08-a2a-server.ts` — expose DeepAgent as A2A JSON-RPC server
- `examples/09-cli-and-rest.ts` — REST API server

### Basic Planning Agent

```typescript
import { DeepAgent } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const agent = DeepAgent.minimal({
  model: openai("gpt-4o"),
  instructions: `You are a project planner. Break tasks into todos,
    then work through them systematically.`,
  maxSteps: 50,
});

const result = await agent.run(
  "Set up a REST API with user authentication endpoints."
);
```

### Agent with MCP Tools

```typescript
import { DeepAgent, AiSdkMcpAdapter } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const mcp = new AiSdkMcpAdapter({
  servers: [
    {
      id: "web-search",
      name: "Web Search",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@anthropic/web-search-mcp"],
    },
  ],
});

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You can search the web to answer questions.",
})
  .withMcp(mcp)
  .withPlanning()
  .build();

const result = await agent.run("Research the latest Node.js release.");
await agent.dispose();
```

### Full-Featured Agent with Persistence

```typescript
import {
  DeepAgent,
  SupabaseMemoryAdapter,
  LocalFilesystem,
  TiktokenTokenCounter,
} from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a senior engineer working on a codebase.",
  maxSteps: 100,
  context: {
    summarizationThreshold: 0.65,
    offloadTokenThreshold: 15_000,
  },
  checkpoint: {
    enabled: true,
    baseStepInterval: 10,
    maxCheckpoints: 5,
  },
})
  .withFilesystem(new LocalFilesystem("/path/to/project"))
  .withMemory(new SupabaseMemoryAdapter(supabase))
  .withTokenCounter(new TiktokenTokenCounter())
  .withPlanning()
  .withSubagents({ maxDepth: 2, timeoutMs: 120_000 })
  .withApproval({
    defaultMode: "approve-all",
    requireApproval: ["write_file", "edit_file"],
    onApprovalRequired: async (request) => {
      console.log(`Approve ${request.toolName}?`, request.args);
      return true; // Replace with actual UI prompt
    },
  })
  .on("agent:start", (e) => console.log("Agent started"))
  .on("error", (e) => console.error("Error:", e.data))
  .build();

const result = await agent.run("Refactor the auth module to use JWT.");
await agent.dispose();
```

## Configuration

### DeepAgentConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | `crypto.randomUUID()` | Agent/session identifier |
| `name` | `string` | -- | Display name |
| `instructions` | `string` | **(required)** | System prompt |
| `model` | `LanguageModel` | **(required)** | AI SDK model instance |
| `maxSteps` | `number` | `30` | Maximum tool-loop iterations |
| `context` | `ContextConfig` | See below | Context window management |
| `approval` | `ApprovalConfig` | See below | Human-in-the-loop settings |
| `subagent` | `SubagentConfig` | See below | Subagent orchestration settings |
| `checkpoint` | `CheckpointConfig` | See below | Checkpoint/resume settings |

### ContextConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `summarizationThreshold` | `number` | `0.70` | Context ratio to trigger summarization |
| `truncationThreshold` | `number` | `0.85` | Context ratio to trigger truncation |
| `offloadTokenThreshold` | `number` | `20000` | Token count to trigger VFS offload |
| `summarizationModel` | `LanguageModel \| null` | `null` (uses agent model) | Model for summarization calls |
| `preserveRecentMessages` | `number` | `10` | Messages to keep during summarization |

### ApprovalConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `defaultMode` | `"approve-all" \| "deny-all"` | `"approve-all"` | Default approval policy |
| `requireApproval` | `string[]` | `[]` | Tools requiring approval (deny-list) |
| `autoApprove` | `string[]` | `[]` | Auto-approved tools (allow-list) |
| `onApprovalRequired` | `(req) => Promise<boolean>` | `async () => true` | Approval callback |

### SubagentConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `maxDepth` | `number` | `3` | Maximum nesting depth |
| `timeoutMs` | `number` | `300000` | Execution timeout (ms) |
| `allowNesting` | `boolean` | `true` | Whether subagents can spawn subagents |

### CheckpointConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable checkpointing |
| `baseStepInterval` | `number` | `5` | Steps between checkpoints |
| `maxCheckpoints` | `number` | `10` | Maximum retained checkpoints |

## Multi-Runtime Support

The framework runs on **Node.js**, **Deno**, **Bun**, **Edge** (Cloudflare Workers, Vercel Edge), and **Browser** runtimes. The core API (`DeepAgent`, `VirtualFilesystem`, `InMemoryAdapter`) is runtime-agnostic; platform-specific adapters live in dedicated sub-path exports.

### RuntimePort

Platform-specific APIs are abstracted behind a `RuntimePort` interface. The framework auto-detects your runtime and selects the appropriate adapter:

```ts
import { DeepAgent } from "@giulio-leone/gaussflow-agent";

// Auto-detect runtime (Node, Deno, Bun, or Edge)
const agent = DeepAgent.create({ model, instructions: "..." }).build();

// Or specify explicitly
import { DenoRuntimeAdapter } from "@giulio-leone/gaussflow-agent";
const agent = DeepAgent.create({ model, instructions: "..." })
  .withRuntime(new DenoRuntimeAdapter())
  .build();
```

| Adapter | Runtime | `getEnv()` |
|---------|---------|------------|
| `NodeRuntimeAdapter` | Node.js | `process.env` |
| `DenoRuntimeAdapter` | Deno | `Deno.env.get()` |
| `BunRuntimeAdapter` | Bun | `process.env` |
| `EdgeRuntimeAdapter` | Edge/CF Workers | Returns `undefined` (env bound via request context) |

### Installation per Runtime

```ts
// Node.js / Bun — core + Node-specific adapters
import { DeepAgent } from '@giulio-leone/gaussflow-agent';
import { LocalFilesystem, TiktokenTokenCounter } from '@giulio-leone/gaussflow-agent/node';

// Deno — Deno.Kv memory, Deno filesystem
import { DenoFilesystem, DenoKvMemoryAdapter } from '@giulio-leone/gaussflow-agent/deno';

// Edge / Cloudflare Workers — OPFS filesystem, IndexedDB memory
import { OpfsFilesystem, IndexedDbMemoryAdapter } from '@giulio-leone/gaussflow-agent/edge';

// Browser — same adapters as Edge (OPFS + IndexedDB)
import { OpfsFilesystem, IndexedDbMemoryAdapter } from '@giulio-leone/gaussflow-agent/browser';
```

### Auto-Configuration

`DeepAgent.auto()` creates an agent using universal adapters (`VirtualFilesystem`, `InMemoryAdapter`, `ApproximateTokenCounter`) that work in any runtime — no platform-specific imports required.

```ts
import { DeepAgent } from '@giulio-leone/gaussflow-agent';
import { openai } from '@ai-sdk/openai';

const agent = DeepAgent.auto({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.',
});

const result = await agent.run('Summarize the project.');
```

For runtime-specific adapters (e.g. `LocalFilesystem`, `DenoKvMemoryAdapter`), use `DeepAgent.create()` and compose manually.

### MCP Server Mode

Expose agent tools as an MCP-compatible HTTP server for cross-language consumption:

```ts
import { DeepAgent } from '@giulio-leone/gaussflow-agent';
import { McpServer, createStreamableHttpHandler } from '@giulio-leone/gaussflow-agent/server';
import { openai } from '@ai-sdk/openai';

const agent = DeepAgent.minimal({
  model: openai('gpt-4o'),
  instructions: 'You are a coding assistant.',
});

const server = new McpServer({
  name: 'my-agent',
  version: '1.0.0',
  tools: agent.tools,
});

const handler = createStreamableHttpHandler({ server });

// Node.js / Bun — serve with any HTTP framework
const httpServer = Bun.serve({ port: 3000, fetch: handler });
// Or with Node.js:
// import { createServer } from 'node:http';
// createServer(async (req, res) => { ... }).listen(3000);
```

### Cross-Language Consumption

Any language that speaks HTTP + JSON-RPC can consume agent tools via the MCP Streamable HTTP transport. Initialize a session, list available tools, call them, and close the session — all with standard HTTP requests.

See [`examples/python-mcp-client/`](./examples/python-mcp-client/) for a working Python client.

## Multi-Agent Collaboration

Orchestrate multiple agents using a declarative graph API with DAG execution, parallel forking, and consensus:

```ts
import { AgentGraph, LlmJudgeConsensus } from '@giulio-leone/gaussflow-agent';
import { openai } from '@ai-sdk/openai';

const model = openai('gpt-4o');

const graph = AgentGraph.create({ maxConcurrency: 3 })
  .node('research', { model, instructions: 'Research the topic thoroughly.' })
  .node('code', { model, instructions: 'Write clean, tested code.' })
  .node('test', { model, instructions: 'Write comprehensive tests.' })
  .edge('research', 'code')
  .edge('code', 'test')
  .fork('review', [
    { model, instructions: 'Review for correctness and bugs.' },
    { model, instructions: 'Review for performance and style.' },
    { model, instructions: 'Review for security vulnerabilities.' },
  ])
  .consensus('review', new LlmJudgeConsensus({ model }))
  .edge('test', 'review')
  .build();

const result = await graph.run('Build a REST API with JWT auth.');
console.log(result.output);
console.log(result.nodeResults); // Per-node results
```

## Real-Time Event Streaming

Stream agent events via SSE for real-time monitoring:

```ts
import { DeepAgent, createSseHandler } from '@giulio-leone/gaussflow-agent';
import { openai } from '@ai-sdk/openai';

const agent = DeepAgent.minimal({ model: openai('gpt-4o'), instructions: '...' });
const handler = createSseHandler({ eventBus: agent.eventBus });

// Serve with any runtime (Node.js, Deno, Bun, Cloudflare Workers)
Bun.serve({ port: 3001, fetch: handler });
```

Client-side with native EventSource:

```js
const source = new EventSource('http://localhost:3001?filter=tool:call,step:end');
source.addEventListener('tool:call', (e) => console.log(JSON.parse(e.data)));
```

## CLI

```bash
# Interactive REPL
gaussflow chat --provider openai --api-key sk-...

# Single-shot
gaussflow run "What is AI?" --provider anthropic

# Config management
gaussflow config set openai sk-...
gaussflow config list

# Feature demos
gaussflow demo guardrails --provider openai
gaussflow demo workflow --provider openai
gaussflow demo graph --provider openai
```

## REST API

```typescript
import { GaussFlowServer } from "@giulio-leone/gaussflow-agent";

const server = new GaussFlowServer({ port: 3456, cors: true });
await server.listen();
```

```bash
# Health check
curl http://localhost:3456/api/health

# Run prompt
curl -X POST http://localhost:3456/api/run \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello!","provider":"openai","apiKey":"sk-..."}'

# Stream response (SSE)
curl -X POST http://localhost:3456/api/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Tell me a story","provider":"openai","apiKey":"sk-..."}'
```

## License

MIT
