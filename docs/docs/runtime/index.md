---
sidebar_position: 4
title: Multi-Runtime Support
description: Run GaussFlow on Node.js, Deno, Bun, Edge, and Browser
---

# Multi-Runtime Support

GaussFlow runs on **Node.js**, **Deno**, **Bun**, **Edge** (Cloudflare Workers, Vercel Edge), and **Browser**. The core API is runtime-agnostic; platform-specific adapters live in dedicated sub-path exports.

## RuntimePort

Platform-specific APIs are abstracted behind the `RuntimePort` interface:

```typescript
interface RuntimePort {
  randomUUID(): string;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  getEnv(key: string): string | undefined;
  setTimeout(callback: () => void, ms: number): { clear(): void };
}
```

## Auto-Detection

The framework auto-detects your runtime and selects the appropriate adapter:

```typescript
import { DeepAgent } from "@giulio-leone/gaussflow-agent";

// Auto-detect runtime
const agent = DeepAgent.create({ model, instructions: "..." }).build();
```

Or specify explicitly:

```typescript
import { DenoRuntimeAdapter } from "@giulio-leone/gaussflow-agent";

const agent = DeepAgent.create({ model, instructions: "..." })
  .withRuntime(new DenoRuntimeAdapter())
  .build();
```

## Runtime Adapters

| Adapter | Runtime | `getEnv()` | UUID |
|---------|---------|------------|------|
| `NodeRuntimeAdapter` | Node.js | `process.env` | `crypto.randomUUID()` |
| `DenoRuntimeAdapter` | Deno | `Deno.env.get()` | `crypto.randomUUID()` |
| `BunRuntimeAdapter` | Bun | `process.env` | `crypto.randomUUID()` |
| `EdgeRuntimeAdapter` | Edge/CF Workers | Returns `undefined` | `crypto.randomUUID()` |

## Sub-Path Exports

```typescript
// Node.js / Bun — core + Node-specific adapters
import { DeepAgent } from "@giulio-leone/gaussflow-agent";
import { LocalFilesystem, TiktokenTokenCounter } from "@giulio-leone/gaussflow-agent/node";

// Deno — Deno-specific adapters
import { DenoFilesystem, DenoKvMemoryAdapter } from "@giulio-leone/gaussflow-agent/deno";

// Edge / Cloudflare Workers
import { OpfsFilesystem, IndexedDbMemoryAdapter } from "@giulio-leone/gaussflow-agent/edge";

// Browser
import { OpfsFilesystem, IndexedDbMemoryAdapter } from "@giulio-leone/gaussflow-agent/browser";
```

## Universal Mode

`DeepAgent.auto()` creates an agent using universal adapters that work in **any** runtime:

```typescript
import { DeepAgent } from "@giulio-leone/gaussflow-agent";
import { openai } from "@ai-sdk/openai";

const agent = DeepAgent.auto({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant.",
});

// Uses VirtualFilesystem, InMemoryAdapter, ApproximateTokenCounter
const result = await agent.run("Hello");
```

## MCP Server Mode

Expose agent tools as an MCP-compatible HTTP server:

```typescript
import { DeepAgent } from "@giulio-leone/gaussflow-agent";
import { McpServer, createStreamableHttpHandler } from "@giulio-leone/gaussflow-agent/server";

const agent = DeepAgent.minimal({
  model: openai("gpt-4o"),
  instructions: "You are a coding assistant.",
});

const server = new McpServer({
  name: "my-agent",
  version: "1.0.0",
  tools: agent.tools,
});

const handler = createStreamableHttpHandler({ server });
Bun.serve({ port: 3000, fetch: handler });
```

## Real-Time Event Streaming

Stream agent events via SSE:

```typescript
import { DeepAgent, createSseHandler } from "@giulio-leone/gaussflow-agent";

const agent = DeepAgent.minimal({ model, instructions: "..." });
const handler = createSseHandler({ eventBus: agent.eventBus });

Bun.serve({ port: 3001, fetch: handler });
```

Client-side:

```javascript
const source = new EventSource("http://localhost:3001?filter=tool:call,step:end");
source.addEventListener("tool:call", (e) => console.log(JSON.parse(e.data)));
```
