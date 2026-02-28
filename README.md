# Gauss

[![npm version](https://img.shields.io/npm/v/gauss)](https://www.npmjs.com/package/gauss)
[![CI](https://github.com/giulio-leone/gauss/actions/workflows/ci.yml/badge.svg)](https://github.com/giulio-leone/gauss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-2347%20passing-brightgreen)](https://github.com/giulio-leone/gauss)
[![Docs](https://img.shields.io/badge/docs-giulio--leone.github.io%2Fgauss-purple)](https://giulio-leone.github.io/gauss/)

> **The most complete AI agent framework for TypeScript.**
> 100+ features · 2,347 tests · Hexagonal architecture · Zero vendor lock-in.

## Install

```bash
npm install gauss
```

## Zero Config — One Line

```ts
import gauss from 'gauss'

const answer = await gauss('Explain quantum computing in 3 sentences')
```

## Full Control — Agent Builder

```ts
import { agent, tool } from 'gauss'
import { openai } from 'gauss/providers'

const myAgent = agent({
  model: openai('gpt-5.2'),
  instructions: 'You are a helpful assistant.',
  tools: [
    tool({
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: z.object({ location: z.string() }),
      execute: async ({ location }) => `Sunny in ${location}`,
    }),
  ],
}).build()

const result = await myAgent.run('What is the weather in Tokyo?')
console.log(result.text)
```

## Multi-Agent Teams

```ts
import { team } from 'gauss'

const devTeam = team()
  .id('dev-team')
  .coordinator(architect, 'lead')
  .specialist(frontend, { id: 'ui', specialties: ['react'] })
  .specialist(backend, { id: 'api', specialties: ['node'] })
  .strategy('delegate')
  .build()

const result = await devTeam.run('Build a REST API for user management')
```

## Workflow DSL

```ts
import { workflow } from 'gauss'

const pipeline = workflow('etl')
  .then({ id: 'fetch', execute: async (ctx) => ({ ...ctx, data: await fetch(ctx.url) }) })
  .branch(
    (ctx) => ctx.data.length > 100,
    { id: 'summarize', execute: summarizeStep },
    { id: 'passthrough', execute: async (ctx) => ctx }
  )
  .parallel(
    { id: 'store', execute: storeStep },
    { id: 'notify', execute: notifyStep }
  )
  .build()
```

## Voice (STT/TTS)

```ts
import { OpenAIVoiceAdapter, VoicePipeline } from 'gauss'

const voice = new OpenAIVoiceAdapter({ apiKey: process.env.OPENAI_API_KEY! })
const pipeline = new VoicePipeline({ voice, agent: myAgent })
const { audio } = await pipeline.process(userAudioBuffer)
```

## Multimodal (Images & Video)

```ts
import { multimodal, videoProcessor } from 'gauss'
import { openai } from 'gauss/providers'

const vision = multimodal({ model: openai('gpt-5.2') })
const desc = await vision.describeImage({ source: { type: 'url', url: '...' } })
const text = await vision.extractText({ source: { type: 'url', url: '...' } })  // OCR

const video = videoProcessor({ model: openai('gpt-5.2') })
const analysis = await video.describeVideo({ source: { type: 'url', url: '...' }, duration: 30 })
```

## 40+ AI Providers

```ts
import { universalProvider } from 'gauss/providers'

const provider = universalProvider()
const gpt = await provider.get('openai:gpt-5.2')
const claude = await provider.get('anthropic:claude-sonnet-4-20250514')
const gemini = await provider.get('google:gemini-2.5-flash-preview-05-20')

// Auto-discover installed providers
const installed = await provider.discoverInstalled()
```

## Why Gauss?

| Feature | Gauss | Mastra | DeepAgentsJS | LangChain |
|---------|:-----:|:------:|:------------:|:---------:|
| Total features | **100+** | 34 | 18 | 12 |
| Tests | **2,347** | — | ~50 | — |
| Vector stores | **30** | 30+ | 0 | — |
| Telemetry drivers | **12** | 12+ | 1 | — |
| Voice drivers | **12** | 12+ | 0 | — |
| Auth drivers | **5** | 5 | 0 | — |
| Server adapters | **4** | 4 | 0 | — |
| Orchestration patterns | **5** | 1 | 0 | 1 |
| Hexagonal architecture | ✅ | ❌ | ❌ | ❌ |
| Time-travel debugger | ✅ | ❌ | ❌ | ❌ |
| Agent testing framework | ✅ | ❌ | ❌ | ❌ |
| Execution replay | ✅ | ❌ | ❌ | ❌ |
| IO Guardrails | ✅ | partial | ❌ | ❌ |
| Structured output repair | ✅ | ❌ | ❌ | ❌ |

## Features

### Core Agent
- **Agent Builder** — Fluent API with tools, structured output, streaming
- **Graph Engine** — DAG execution with parallel nodes, conditions, cycles
- **RAG Pipeline** — Ingest → chunk → embed → store → retrieve (+ Graph RAG)
- **Planning** — Multi-step task decomposition (Plan → Phase → Step)
- **Teams** — Coordinator + specialists (round-robin, delegate, broadcast, pipeline)
- **Workflows** — `.then()` / `.branch()` / `.parallel()` DSL

### Agent Orchestration (5 patterns)
- **Supervisor** — Delegate to sub-agents, aggregate results
- **Swarm** — Peer-to-peer with shared blackboard
- **Pipeline** — Sequential chaining with error strategies
- **MapReduce** — Parallel split/reduce with concurrency control
- **Debate** — Multi-round argumentation with judge/majority/unanimous voting

### Safety & Guardrails
- **PII Detector** — Email, phone, SSN, credit card detection + redaction
- **Injection Detector** — 8 prompt injection patterns
- **Content Moderator** — Keyword-based moderation
- **Token Budget** — Input/output token limit enforcement
- **Schema Validator** — JSON schema compliance for outputs
- **Trip Wire** — Token budget, time limit, cost cap

### Observability
- **Traces & Spans** — OpenTelemetry-compatible format
- **Metrics** — Latency, tokens, cost, error rate
- **Rate Limiter** — Token bucket, sliding window, fixed window, leaky bucket
- **Cost Tracker** — Multi-key budget enforcement by model

### Multimodal
- **Voice** — 12 providers (OpenAI, ElevenLabs, Deepgram, Google, Azure, etc.)
- **Images** — Describe, OCR, compare with any vision model
- **Video** — Frame extraction, scene description

### Infrastructure
- **40+ LLM Providers** — UniversalProvider wraps any @ai-sdk/* package
- **30 Vector Stores** — Pinecone, Qdrant, Chroma, Weaviate, Redis, and 25 more
- **12 Telemetry** — Langfuse, LangSmith, Datadog, Sentry, and 8 more
- **5 Auth** — Auth0, Clerk, Firebase, Supabase, custom
- **4 Server Adapters** — Express, Fastify, Hono, Koa
- **Protocols** — MCP client/server, A2A agent-to-agent, ACP

### Developer Experience
- **Zero Config** — `gauss('prompt')` with env auto-detection
- **CLI** — `gauss init` with 6 templates
- **Playground** — Interactive web UI + WebSocket API
- **Agent Debugger** — Time-travel debugging with branching & breakpoints
- **Agent Testing** — Scenario runner, fuzzer, coverage, regression suite
- **Execution Replay** — Record + replay full agent runs deterministically
- **Structured Output** — Multi-format parsing + JSON repair + streaming
- **Advanced Memory** — Short/long-term, episodic, semantic, working memory
- **DI Container** — Auto-resolution dependency injection
- **Type Builder** — Zod schema → TypeScript generation
- **Codemod** — AST transforms for version migration

## Architecture

Gauss uses **Hexagonal Architecture** (Ports & Adapters):

```
┌──────────────────────────────────────────┐
│               Application                │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │          Domain Layer            │    │
│  │  Agents · Graphs · Workflows     │    │
│  │  Planning · Teams · RAG          │    │
│  └──────┬───────────────┬───────────┘    │
│         │    Ports       │               │
│  ┌──────▼────┐   ┌──────▼────┐           │
│  │ LLMPort   │   │ MemoryPort│           │
│  │ VoicePort │   │ QueuePort │           │
│  │ VectorPort│   │ CachePort │           │
│  └──────┬────┘   └──────┬────┘           │
│         │   Adapters     │               │
│  ┌──────▼────┐   ┌──────▼────┐           │
│  │ OpenAI    │   │ PostgreSQL│           │
│  │ Anthropic │   │ Redis     │           │
│  │ Google    │   │ S3        │           │
│  │ 40+ more  │   │ BullMQ    │           │
│  └───────────┘   └───────────┘           │
└──────────────────────────────────────────┘
```

## Documentation

📚 **[giulio-leone.github.io/gauss](https://giulio-leone.github.io/gauss/)**

- [Getting Started](https://giulio-leone.github.io/gauss/docs/)
- [Concepts](https://giulio-leone.github.io/gauss/docs/concepts)
- [Cookbook (21 recipes)](https://giulio-leone.github.io/gauss/docs/cookbook)
- [API Reference](https://giulio-leone.github.io/gauss/docs/api-reference/ports)
- [Comparison](https://giulio-leone.github.io/gauss/docs/comparison)

## Examples

17 production-ready examples in [`examples/`](examples/):

```bash
npx tsx examples/17-zero-config.ts        # Simplest possible
npx tsx examples/01-basic-agent.ts        # Agent with tools
npx tsx examples/10-team-coordination.ts  # Multi-agent team
npx tsx examples/12-workflow-dsl.ts       # Workflow pipeline
npx tsx examples/13-multimodal-vision.ts  # Image analysis
```

## CLI

```bash
# Scaffold a new project
npx gauss init

# Templates: minimal, full, rag, mcp, team, workflow
npx gauss init --template team my-project
```

## Gauss Ecosystem

| Package | Description |
|---------|-------------|
| [`gauss`](https://github.com/giulio-leone/gauss) | TypeScript framework (this repo) |
| [`gauss-core`](https://github.com/giulio-leone/gauss-core) | Rust engine — NAPI + WASM + PyO3 + CLI |
| [`gauss-sdk`](https://github.com/giulio-leone/gauss-sdk) | Enhanced AI SDK fork |

## License

MIT © [Giulio Leone](https://github.com/giulio-leone)
