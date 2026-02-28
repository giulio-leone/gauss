# Gauss

[![CI](https://github.com/giulio-leone/gauss/actions/workflows/ci.yml/badge.svg)](https://github.com/giulio-leone/gauss/actions/workflows/ci.yml)
[![npm](https://img.shields.io/badge/npm-v2.3.0-blue)](https://github.com/giulio-leone/gauss/packages)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-1739%20passing-brightgreen)](https://github.com/giulio-leone/gauss)
[![Docs](https://img.shields.io/badge/docs-giulio--leone.github.io%2Fgauss-purple)](https://giulio-leone.github.io/gauss/)

> **The most complete AI agent framework for TypeScript.**
> 57 features · Hexagonal architecture · Zero config to start.

## Install

```bash
npm install @giulio-leone/gauss
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
  model: openai('gpt-4o'),
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

const vision = multimodal({ model: openai('gpt-4o') })
const desc = await vision.describeImage({ source: { type: 'url', url: '...' } })
const text = await vision.extractText({ source: { type: 'url', url: '...' } })  // OCR

const video = videoProcessor({ model: openai('gpt-4o') })
const analysis = await video.describeVideo({ source: { type: 'url', url: '...' }, duration: 30 })
```

## 40+ AI Providers

```ts
import { universalProvider } from 'gauss/providers'

const provider = universalProvider()
const gpt = await provider.get('openai:gpt-4o')
const claude = await provider.get('anthropic:claude-sonnet-4-20250514')
const gemini = await provider.get('google:gemini-2.0-flash')

// Auto-discover installed providers
const installed = await provider.discoverInstalled()
```

## Why Gauss?

| Feature | Gauss | Mastra | LangChain | Agno |
|---------|:-----:|:------:|:---------:|:----:|
| Feature coverage | **57/57** | 36/57 | 12/57 | 31/57 |
| Zero-config quickstart | ✅ | ❌ | ❌ | ❌ |
| Multi-agent teams | ✅ | ❌ | ❌ | ✅ |
| 4 coordination strategies | ✅ | ❌ | ❌ | ❌ |
| Fluent workflow DSL | ✅ | partial | ❌ | ❌ |
| Voice STT/TTS | ✅ | ✅ | ❌ | ✅ |
| Image + Video processing | ✅ | ❌ | ❌ | partial |
| 40+ LLM providers | ✅ | ✅ | ✅ | ✅ |
| Hexagonal architecture | ✅ | ❌ | ❌ | ❌ |
| Plugin system | ✅ | partial | ❌ | ❌ |
| MCP + A2A protocols | ✅ | MCP only | ❌ | ❌ |
| LLM recording/replay | ✅ | ✅ | ❌ | ❌ |
| Visual agent builder | ✅ | ✅ | ❌ | ❌ |
| Graph RAG | ✅ | ❌ | ❌ | ❌ |
| CLI scaffolding (6 templates) | ✅ | ✅ | ❌ | ❌ |
| PostgreSQL/Redis/S3/BullMQ | ✅ | partial | ❌ | ❌ |

## Features

### Core
- **Agent Builder** — Fluent API with tools, structured output, streaming
- **Graph Engine** — DAG execution with parallel nodes, conditions, cycles
- **RAG Pipeline** — Ingest → chunk → embed → store → retrieve
- **Planning** — Multi-step task decomposition (Plan → Phase → Step)
- **Teams** — Coordinator + specialists (round-robin, delegate, broadcast, pipeline)
- **Workflows** — `.then()` / `.branch()` / `.parallel()` DSL

### Multimodal
- **Voice** — OpenAI Whisper STT, TTS, ElevenLabs premium voices
- **Images** — Describe, OCR, compare with any vision model
- **Video** — Frame extraction, scene description, audio extraction

### Infrastructure
- **40+ Providers** — UniversalProvider wraps any @ai-sdk/* package
- **Persistence** — PostgreSQL, Redis, pgvector, S3, BullMQ
- **Plugins** — Guardrails, evals, observability, caching, web scraping
- **Protocols** — MCP client/server, A2A agent-to-agent
- **Multi-runtime** — Node.js, Deno, Bun, Edge, Browser

### Developer Experience
- **Zero Config** — `gauss('prompt')` with env auto-detection
- **CLI** — `gauss init` with 6 templates
- **Visual Builder** — JSON config → executable agent graph
- **LLM Recording** — Record and replay for deterministic testing
- **Playground** — Inspector APIs for debugging
- **Error Messages** — `GaussError` with actionable suggestions

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

## License

MIT © [Giulio Leone](https://github.com/giulio-leone)
