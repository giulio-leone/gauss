---
sidebar_position: 1
title: Getting Started
description: Install Gauss and build AI agents in seconds
slug: /
---

# Getting Started

**Gauss** is the most complete AI agent framework for TypeScript — 57 features, hexagonal architecture, zero config to start.

## Install

```bash
npm install @giulio-leone/gauss
```

## One-liner (Zero Config)

```ts
import gauss from 'gauss'

// Auto-detects OPENAI_API_KEY from environment
const answer = await gauss('Explain quantum computing in 3 sentences')
console.log(answer)
```

## Agent Builder (Full Control)

```ts
import { agent } from 'gauss'
import { openai } from 'gauss/providers'

const assistant = agent({
  model: openai('gpt-5.2'),
  instructions: 'You are a helpful coding assistant.',
}).build()

const result = await assistant.run('Write a fizzbuzz in TypeScript')
console.log(result.text)
```

## Team of Agents

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

const pipeline = workflow('data-pipeline')
  .then({ id: 'fetch', execute: async (ctx) => ({ ...ctx, data: await fetchData() }) })
  .branch(
    (ctx) => ctx.data.length > 100,
    { id: 'summarize', execute: async (ctx) => ({ ...ctx, summary: summarize(ctx.data) }) },
    { id: 'passthrough', execute: async (ctx) => ctx }
  )
  .parallel(
    { id: 'store', execute: async (ctx) => { await store(ctx); return ctx } },
    { id: 'notify', execute: async (ctx) => { await notify(ctx); return ctx } }
  )
  .build()
```

## Multimodal (Images + Video)

```ts
import { multimodal, videoProcessor } from 'gauss'
import { openai } from 'gauss/providers'

const vision = multimodal({ model: openai('gpt-5.2') })
const description = await vision.describeImage({
  source: { type: 'url', url: 'https://example.com/photo.jpg' }
})

const video = videoProcessor({ model: openai('gpt-5.2') })
const analysis = await video.describeVideo({
  source: { type: 'url', url: 'https://example.com/video.mp4' },
  duration: 30
})
```

## Voice (STT/TTS)

```ts
import { OpenAIVoiceAdapter, VoicePipeline } from 'gauss'

const voice = new OpenAIVoiceAdapter({ apiKey: process.env.OPENAI_API_KEY! })
const pipeline = new VoicePipeline({ voice, agent: myAgent })
const { audio } = await pipeline.process(userAudioBuffer)
```

## 40+ Providers

```ts
import { universalProvider } from 'gauss/providers'

const provider = universalProvider()
const model = await provider.get('openai:gpt-5.2')
const model2 = await provider.get('anthropic:claude-sonnet-4-20250514')

// Discover what's installed
const installed = await provider.discoverInstalled()
```

## Environment Variables

Gauss auto-detects AI providers:

| Variable | Provider | Default Model |
|----------|----------|---------------|
| `OPENAI_API_KEY` | OpenAI | gpt-5.2 |
| `ANTHROPIC_API_KEY` | Anthropic | claude-sonnet-4-20250514 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google | gemini-2.5-flash-preview-05-20 |
| `GROQ_API_KEY` | Groq | llama-3.3-70b-versatile |
| `MISTRAL_API_KEY` | Mistral | mistral-large-latest |

## Architecture

Gauss uses **Hexagonal Architecture** (Ports & Adapters):

- **Ports** — Interfaces (LLM, memory, vector store, voice, queue, etc.)
- **Adapters** — Implementations (PostgreSQL, Redis, OpenAI, ElevenLabs, S3, etc.)
- **Domain** — Pure business logic (agents, graphs, workflows, planning)

Every component is swappable and independently testable.

## Next Steps

- [Concepts](/docs/concepts) — Core concepts and architecture
- [Cookbook](/docs/cookbook) — 20+ practical recipes
- [API Reference](/docs/api-reference/ports) — Complete API documentation
- [Comparison](/docs/comparison) — How Gauss compares to Mastra, LangChain, Agno
