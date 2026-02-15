---
sidebar_position: 7
title: Adapter Classes
description: Complete reference for all GaussFlow adapter implementations
---

# Adapter Classes

Adapters are concrete implementations of [port interfaces](./ports). The framework ships with defaults for every port.

## Filesystem Adapters

### VirtualFilesystem

In-memory filesystem with optional disk persistence. **Default adapter.**

```typescript
import { VirtualFilesystem } from "@giulio-leone/gaussflow-agent";

const vfs = new VirtualFilesystem();
await vfs.write("/hello.txt", "Hello, world!");
const content = await vfs.read("/hello.txt");
```

Supports transient and persistent zones, optional disk sync via `syncToPersistent()`.

### LocalFilesystem

Sandboxed wrapper over Node.js `fs`. Restricts operations to a configured base path.

```typescript
import { LocalFilesystem } from "@giulio-leone/gaussflow-agent/node";

const fs = new LocalFilesystem("/path/to/project");
const content = await fs.read("src/index.ts");
```

## Memory Adapters

### InMemoryAdapter

`Map`-based in-process storage. **Default adapter.** Suitable for testing and ephemeral sessions.

```typescript
import { InMemoryAdapter } from "@giulio-leone/gaussflow-agent";

const memory = new InMemoryAdapter();
await memory.saveTodos("session-1", [{ id: "1", title: "Task", status: "pending" }]);
```

### SupabaseMemoryAdapter

Supabase-backed persistent storage using `deep_agent_todos`, `deep_agent_checkpoints`, `deep_agent_conversations`, and `deep_agent_metadata` tables.

```typescript
import { SupabaseMemoryAdapter } from "@giulio-leone/gaussflow-agent";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const memory = new SupabaseMemoryAdapter(supabase);
```

## Runtime Adapters

### Auto-Detection

```typescript
import { detectRuntimeName, createRuntimeAdapter } from "@giulio-leone/gaussflow-agent";

const runtimeName = detectRuntimeName(); // "node" | "deno" | "bun" | "edge"
const runtime = createRuntimeAdapter();  // Auto-selects based on environment
```

### NodeRuntimeAdapter

```typescript
import { NodeRuntimeAdapter } from "@giulio-leone/gaussflow-agent";
const runtime = new NodeRuntimeAdapter();
runtime.getEnv("NODE_ENV"); // process.env.NODE_ENV
```

### DenoRuntimeAdapter

```typescript
import { DenoRuntimeAdapter } from "@giulio-leone/gaussflow-agent";
const runtime = new DenoRuntimeAdapter();
runtime.getEnv("DENO_ENV"); // Deno.env.get("DENO_ENV")
```

### BunRuntimeAdapter

```typescript
import { BunRuntimeAdapter } from "@giulio-leone/gaussflow-agent";
const runtime = new BunRuntimeAdapter();
```

### EdgeRuntimeAdapter

For Cloudflare Workers and Vercel Edge. Environment variables are bound via request context, so `getEnv()` returns `undefined`.

```typescript
import { EdgeRuntimeAdapter } from "@giulio-leone/gaussflow-agent";
const runtime = new EdgeRuntimeAdapter();
```

## Token Counter Adapters

### ApproximateTokenCounter

Fast estimation using ~4 characters per token. **Default adapter.** Includes context window sizes for common models.

```typescript
import { ApproximateTokenCounter } from "@giulio-leone/gaussflow-agent";

const counter = new ApproximateTokenCounter();
counter.count("Hello, world!"); // ~3
```

### TiktokenTokenCounter

BPE-accurate counting via the `tiktoken` library.

```typescript
import { TiktokenTokenCounter } from "@giulio-leone/gaussflow-agent/node";

const counter = new TiktokenTokenCounter();
counter.count("Hello, world!", "gpt-4o"); // Exact token count
```

## Validation Adapters

### ZodValidationAdapter

Zod-based implementation of `ValidationPort`. **Default adapter.**

```typescript
import { ZodValidationAdapter } from "@giulio-leone/gaussflow-agent";
import { z } from "zod";

const validator = new ZodValidationAdapter();

// Safe validation
const result = validator.validate(z.string().email(), "user@example.com");
// { success: true, data: "user@example.com" }

// Throwing validation
const email = validator.validateOrThrow(z.string().email(), "bad");
// Throws ZodError
```

## Tracing Adapters

### InMemoryTracingAdapter

In-memory span storage. Useful for testing and development.

```typescript
import { InMemoryTracingAdapter } from "@giulio-leone/gaussflow-agent";

const tracer = new InMemoryTracingAdapter();
const span = tracer.startSpan("my-operation");
span.setAttribute("key", "value");
span.setStatus("ok");
span.end();
```

## Metrics Adapters

### InMemoryMetricsAdapter

In-memory counters, histograms, and gauges.

```typescript
import { InMemoryMetricsAdapter } from "@giulio-leone/gaussflow-agent";

const metrics = new InMemoryMetricsAdapter();
metrics.incrementCounter("requests.total");
metrics.recordHistogram("response.latency", 42);
metrics.recordGauge("connections.active", 5);
```

## Logging Adapters

### ConsoleLoggingAdapter

Structured logging via `console.log`, `console.warn`, and `console.error`.

```typescript
import { ConsoleLoggingAdapter } from "@giulio-leone/gaussflow-agent";

const logger = new ConsoleLoggingAdapter();
logger.info("Server started", { port: 3000 });
logger.error("Connection failed", { host: "db.example.com" });
```

## Learning Adapters

### InMemoryLearningAdapter

`Map`-based in-process learning storage.

```typescript
import { InMemoryLearningAdapter } from "@giulio-leone/gaussflow-agent";

const learning = new InMemoryLearningAdapter();
await learning.updateProfile("user-1", { style: "concise", language: "en" });
await learning.addMemory("user-1", { content: "Prefers TypeScript", tags: ["preference"] });
```

## MCP Adapters

### AiSdkMcpAdapter

Bridges `@ai-sdk/mcp` clients to the `McpPort` interface. Supports stdio, HTTP, and SSE transports.

```typescript
import { AiSdkMcpAdapter } from "@giulio-leone/gaussflow-agent";

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
```

### OnegenUiMcpAdapter

Bridges `@giulio-leone/gaussflow-mcp` `McpRegistry` to the `McpPort` interface.

```typescript
import { OnegenUiMcpAdapter } from "@giulio-leone/gaussflow-agent";

const mcp = new OnegenUiMcpAdapter(mcpRegistry);
```

## Consensus Adapters

### LlmJudgeConsensus

Uses an LLM to evaluate fork results and pick the best output.

```typescript
import { LlmJudgeConsensus } from "@giulio-leone/gaussflow-agent";

const consensus = new LlmJudgeConsensus({ model: openai("gpt-4o") });
```

### MajorityVoteConsensus

Simple majority vote across fork outputs.

```typescript
import { MajorityVoteConsensus } from "@giulio-leone/gaussflow-agent";

const consensus = new MajorityVoteConsensus();
```

### DebateConsensus

Multi-round debate between fork outputs.

```typescript
import { DebateConsensus } from "@giulio-leone/gaussflow-agent";

const consensus = new DebateConsensus({ model: openai("gpt-4o"), rounds: 3 });
```
