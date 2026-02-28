---
sidebar_position: 9
title: Migration Guide
---

# Migration Guide

Migrating from other AI/agent frameworks to Gauss? This guide shows the mapping between APIs.

## From Mastra

Mastra and Gauss share similar concepts but use different import and API patterns.

| Mastra | Gauss |
|--------|-------|
| `new Mastra()` | `import gauss from 'gauss'` |
| `mastra.agent()` | `import { agent } from 'gauss'` |
| `mastra.workflow()` | `import { workflow } from 'gauss'` |

### Tools

Both frameworks use the same tool pattern (name, description, parameters, execute), but with different imports:

```js
// Mastra
const tool = new Tool({
  name: 'search',
  description: 'Search the web',
  parameters: { query: { type: 'string' } },
  execute: async (params) => { /* ... */ }
});

// Gauss
import { tool } from 'gauss';

const searchTool = tool({
  name: 'search',
  description: 'Search the web',
  parameters: { query: { type: 'string' } },
  execute: async (params) => { /* ... */ }
});
```

### Voice

Voice support uses the same concepts, but different imports:

```js
// Gauss
import { agent, voice } from 'gauss';

const myAgent = agent({
  model: 'gpt-4',
  voice: voice({ provider: 'elevenlabs' })
});
```

### Memory

- **Mastra**: Uses KV stores (key-value)
- **Gauss**: Uses MemoryPort adapters for flexible memory backends

```js
// Gauss
import { agent, memory } from 'gauss';

const myAgent = agent({
  model: 'gpt-4',
  memory: memory.redis({ url: 'redis://...' })
});
```

## From LangChain / DeepAgentsJS

LangChain chains and agents map to Gauss graphs and workflows.

| LangChain | Gauss |
|-----------|-------|
| Chains | Gauss graphs or workflows |
| Agents | `agent()` builder |
| Tools | `tool()` builder |
| Memory | MemoryPort adapters |
| Vector Stores | VectorStorePort adapters |

### Example: Chain to Workflow

```js
// LangChain chain
const chain = promptTemplate
  .pipe(llm)
  .pipe(parser);

// Gauss workflow
import { workflow } from 'gauss';

const myWorkflow = workflow({
  nodes: [
    { id: 'prompt', handler: promptTemplate },
    { id: 'llm', handler: llm },
    { id: 'parser', handler: parser }
  ],
  edges: [
    { from: 'prompt', to: 'llm' },
    { from: 'llm', to: 'parser' }
  ]
});
```

### Tools and Agents

```js
// LangChain tool
const tool = new Tool({
  name: 'search',
  func: async (query) => { /* ... */ }
});

// Gauss tool
import { tool } from 'gauss';

const searchTool = tool({
  name: 'search',
  execute: async (params) => { /* ... */ }
});
```

## From Agno

Agno's agent and team abstractions map to Gauss builders.

| Agno | Gauss |
|------|-------|
| `Agent` class | `agent()` builder |
| `Team` | `team()` builder |
| Knowledge (RAG) | RAG pipeline |
| Voice | Voice adapters |

### Example: Agent to Gauss

```python
# Agno (Python)
agent = Agent(model="gpt-4", tools=[search_tool])
agent.run("What is the capital of France?")

// Gauss (JavaScript)
import { agent } from 'gauss';

const myAgent = agent({
  model: 'gpt-4',
  tools: [searchTool]
});

const result = await myAgent.run({ input: 'What is the capital of France?' });
```

### Teams

```python
# Agno
team = Team(agents=[agent1, agent2])

// Gauss
import { team } from 'gauss';

const myTeam = team({
  agents: [agent1, agent2]
});
```

### Knowledge (RAG)

```python
# Agno
agent = Agent(knowledge=KnowledgeBase("docs/"))

// Gauss
import { agent, rag } from 'gauss';

const myAgent = agent({
  model: 'gpt-4',
  knowledge: rag.fromDirectory('docs/')
});
```

## Getting Help

- [API Reference](/docs/api-reference/ports)
- [Cookbook](/docs/cookbook)
- [GitHub Discussions](https://github.com/giulio-leone/gauss/discussions)

