---
sidebar_position: 5
title: VectorlessPlugin
description: RAG/knowledge extraction without vector databases
---

# VectorlessPlugin

The `VectorlessPlugin` provides RAG (Retrieval-Augmented Generation) capabilities without requiring a vector database. It uses `@giulio-leone/gaussflow-vectorless` to extract entities, relations, and quotes from text, then enables querying against the extracted knowledge.

## Installation

```bash
pnpm add @giulio-leone/gaussflow-vectorless
```

## Quick Start

```typescript
import { DeepAgent, createVectorlessPlugin } from "@giulio-leone/gaussflow-agent";

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You can extract and query knowledge from text.",
})
  .use(createVectorlessPlugin())
  .build();

const result = await agent.run(
  "Extract knowledge from this article: [article text]. Then answer: who are the key people mentioned?"
);
```

## Configuration

```typescript
interface VectorlessPluginOptions {
  vectorless?: unknown;          // Pre-configured vectorless instance
  knowledgeBase?: unknown;       // Pre-loaded knowledge to query against
  model?: unknown;               // Model for knowledge generation
  validator?: ValidationPort;    // Custom validation adapter
}
```

## Injected Tools

### `generate`

Extract knowledge (entities, relations, quotes) from text. Must be called before `query` or `search-entities`.

```typescript
// Input
{ text: string, topic?: string }

// Output
"Knowledge extracted: N entities, N relations, N quotes"
```

### `query`

Answer a question using the extracted knowledge base.

```typescript
// Input
{ question: string }

// Output
string  // Answer based on extracted knowledge
```

### `search-entities`

Search for entities in the extracted knowledge base.

```typescript
// Input
{ query: string, limit?: number }  // 1-50 results (default: 10)

// Output
Array<{ name: string, type: string, ... }>
```

### `list`

List all entities in the current knowledge base.

```typescript
// Input: none

// Output
Array<{ name: string, type: string }>
```

## Workflow

The typical usage pattern is:

1. **Generate** — Extract knowledge from a text document
2. **Query** or **Search** — Ask questions or find entities
3. **List** — Browse all extracted entities

The knowledge base persists in memory within the plugin instance for the lifetime of the agent.

## Cleanup

```typescript
await agent.dispose(); // Clears the knowledge base
```
