---
sidebar_position: 2
title: Core Concepts
---

# Core Concepts

The Gauss AI agent framework provides a comprehensive toolkit for building intelligent, multi-agent systems. This guide covers the fundamental concepts that power the framework.

## 1. Agents

Agents are the core building blocks of Gauss. Each agent is an autonomous entity with a language model, instructions, tools, and memory.

**Key characteristics:**
- Wrapped around an LLM (language model)
- Given specific instructions and goals
- Access to tools for interacting with the world
- Persistent memory for context

**Basic usage:**

```typescript
import { agent } from 'gauss';

const researcher = agent()
  .model('gpt-4')
  .instructions('You are a research assistant. Analyze topics thoroughly.')
  .tools([searchTool, analyzeTool])
  .memory('short-term') // or 'long-term'
  .build();

const response = await researcher.run('Research quantum computing');
```

The `.build()` pattern ensures configuration is complete and optimized before execution.

---

## 2. Tools

Tools are functions that agents can invoke to interact with external systems, perform computations, or retrieve information.

**Tool structure:**
- **Name**: Unique identifier
- **Description**: What the tool does
- **Parameters**: Zod-validated input schema
- **Execute**: The actual function logic

**Creating a tool:**

```typescript
import { tool } from 'gauss';
import { z } from 'zod';

const searchTool = tool()
  .name('search')
  .description('Search the web for information')
  .parameters(
    z.object({
      query: z.string().describe('Search query'),
      limit: z.number().optional().describe('Number of results'),
    })
  )
  .execute(async ({ query, limit = 10 }) => {
    // Implementation
    return results;
  })
  .build();
```

Tools are type-safe, self-documenting, and enable agents to take actions beyond pure reasoning.

---

## 3. Graphs

Graphs represent complex workflows as directed acyclic graphs (DAGs) with nodes and edges.

**Structure:**
- **Nodes**: Represent agents or processing steps
- **Edges**: Define dependencies and data flow
- **Conditional routing**: Branch based on node outputs

**Building a graph:**

```typescript
import { graph } from 'gauss';

const pipeline = graph()
  .node('extract', extractionAgent)
  .node('validate', validationAgent)
  .node('store', storageAgent)
  .edge('extract', 'validate')
  .edge('validate', 'store')
  .build();

const result = await pipeline.run(inputData);
```

Graphs enable orchestration of multiple agents and deterministic workflows.

---

## 4. RAG Pipeline

Retrieval-Augmented Generation (RAG) enhances agents with domain-specific knowledge by ingesting, processing, and retrieving documents.

**Pipeline stages:**
1. **Document Ingestion**: Load files (PDFs, markdown, JSON, etc.)
2. **Chunking**: Split documents into manageable pieces
3. **Embedding**: Convert chunks into vector representations
4. **Vector Storage**: Store embeddings in a vector database
5. **Retrieval**: Fetch relevant chunks for agent queries

**RAG setup:**

```typescript
import { rag } from 'gauss';

const knowledgeBase = rag()
  .ingest('./documents')
  .chunkSize(512)
  .chunkOverlap(50)
  .embedModel('openai-embed-3')
  .vectorStore('pinecone')
  .build();

const agent = agent()
  .model('gpt-4')
  .rag(knowledgeBase)
  .tools([knowledgeBase.retriever()])
  .build();
```

RAG transforms agents into domain experts by providing access to specific knowledge sources.

---

## 5. Planning

Planning enables agents to decompose complex tasks into manageable steps with state tracking and multi-step reasoning.

**Hierarchy:**
- **Plan**: Overall task with goal
- **Phase**: Major stages of execution
- **Step**: Individual actions
- **SubStep**: Granular operations

**Planning example:**

```typescript
import { planning } from 'gauss';

const plan = planning()
  .goal('Build a customer support system')
  .phase('Setup')
    .step('Initialize database')
    .step('Configure webhooks')
  .phase('Implementation')
    .step('Create response templates')
    .step('Train sentiment classifier')
    .subStep('Collect training data')
    .subStep('Validate model')
  .build();

const executor = agent()
  .plan(plan)
  .build();
```

Planning provides structure for multi-step reasoning and enables progress tracking.

---

## 6. Teams

Teams coordinate multiple agents to solve complex problems through collaboration strategies.

**Team strategies:**
- **Round-robin**: Each agent takes turns
- **Delegate**: Manager agent assigns tasks
- **Broadcast**: All agents work on the same task
- **Pipeline**: Sequential processing through agents

**Team example:**

```typescript
import { team } from 'gauss';

const supportTeam = team()
  .strategy('delegate')
  .manager(coordinatorAgent)
  .member('triage', triageAgent)
  .member('technical', technicalAgent)
  .member('billing', billingAgent)
  .build();

const response = await supportTeam.run('Customer complaint about subscription');
```

Teams enable division of labor and specialization in multi-agent systems.

---

## 7. Workflows

Workflows provide a chainable DSL for building complex execution patterns with branching and parallelization.

**Core operations:**
- **`.then()`**: Sequential execution
- **`.branch()`**: Conditional execution
- **`.parallel()`**: Concurrent execution

**Workflow example:**

```typescript
import { workflow } from 'gauss';

const dataWorkflow = workflow()
  .step(fetchAgent)
  .then(validationAgent)
  .branch(
    { condition: 'isValid', agent: processingAgent },
    { condition: 'invalid', agent: errorHandlerAgent }
  )
  .parallel([enrichmentAgent, analyticsAgent])
  .then(storageAgent)
  .build();

const result = await dataWorkflow.run(input);
```

Workflows provide elegant composition of complex execution patterns.

---

## 8. Voice

Voice integration enables speech-to-text (STT) and text-to-speech (TTS) capabilities for audio-based interactions.

**Supported adapters:**
- **STT**: OpenAI Whisper, Google Cloud Speech-to-Text
- **TTS**: ElevenLabs, OpenAI TTS, Google Cloud Text-to-Speech

**Voice pipeline:**

```typescript
import { voice } from 'gauss';

const voicePipeline = voice()
  .stt('openai-whisper')
  .tts('elevenlabs', { voice: 'Rachel' })
  .agent(conversationalAgent)
  .build();

const audioResponse = await voicePipeline.process(audioInput);
```

Voice integration enables natural audio interactions with agents.

---

## 9. Multimodal

Multimodal capabilities allow agents to process and generate images, video, and other non-text formats.

**Supported operations:**
- **Image Description**: Generate descriptions of images
- **OCR**: Extract text from images
- **Image Comparison**: Analyze differences between images
- **Video Analysis**: Extract and analyze frames

**Multimodal usage:**

```typescript
import { multimodal } from 'gauss';

const visionAgent = agent()
  .model('gpt-4-vision')
  .tools([
    multimodal.describeImage(),
    multimodal.extractText(),
    multimodal.analyzeVideo(),
  ])
  .build();

const description = await visionAgent.run('Describe this image', { imageUrl });
```

Multimodal support extends agents beyond text-only interactions.

---

## 10. Providers

Gauss wraps 40+ AI SDK providers through a universal interface for seamless provider switching.

**Provider features:**
- **Auto-discovery**: Automatically finds available providers
- **Unified API**: Same interface regardless of provider
- **Fallback support**: Automatic fallback to alternative providers
- **Load balancing**: Distribute requests across providers

**Provider usage:**

```typescript
import { provider } from 'gauss/providers';

const universalProvider = provider()
  .primary('openai')
  .fallback('anthropic')
  .fallback('google')
  .loadBalance(['openai', 'azure', 'cohere'])
  .build();

const agent = agent()
  .provider(universalProvider)
  .model('gpt-4')
  .build();
```

Universal provider abstracts away implementation details while supporting multiple LLM backends.

---

## 11. Ports & Adapters

Gauss follows hexagonal architecture (ports & adapters) to maintain loose coupling and testability.

**Architecture pattern:**
- **Ports**: Interface definitions (what operations are needed)
- **Adapters**: Concrete implementations (specific providers, databases, APIs)

**Key ports:**
- VectorStorePort: Vector database abstraction
- MemoryPort: Memory storage abstraction
- ToolPort: Tool execution abstraction
- ProviderPort: LLM provider abstraction

Every capability in Gauss is implemented as a port interface with multiple adapter implementations, enabling easy switching and testing.

---

## 12. Plugins

Plugins extend agent capabilities with cross-cutting concerns without modifying core logic.

**Plugin types:**
- **Guardrails**: Enforce constraints on agent behavior
- **Evals**: Continuous evaluation of agent responses
- **Observability**: Logging, tracing, monitoring
- **Caching**: Cache responses for efficiency
- **Rate Limiting**: Control API usage

**Plugin example:**

```typescript
import { agent } from 'gauss';

const safeAgent = agent()
  .model('gpt-4')
  .plugin('guardrails', { rules: ['no-pii', 'no-malware'] })
  .plugin('evals', { validators: [toxicityCheck, factualityCheck] })
  .plugin('observability', { provider: 'datadog' })
  .plugin('caching', { ttl: 3600 })
  .build();
```

Plugins provide clean separation of concerns and enable modular agent composition.

---

## 13. MCP (Model Context Protocol)

MCP support enables Gauss agents to interact with MCP-compatible servers for standardized tool integration.

**MCP features:**
- **Client mode**: Agents can call MCP server tools
- **Server mode**: Gauss agents can expose themselves as MCP servers
- **Resource access**: Standard resource types and schemas

**MCP integration:**

```typescript
import { mcp } from 'gauss';

const mcpClient = mcp()
  .connect('file://localhost:3000')
  .build();

const agent = agent()
  .model('gpt-4')
  .tools([mcpClient.tools()])
  .build();
```

MCP enables standardized inter-operability with other AI systems and tools.

---

## 14. A2A (Agent-to-Agent)

A2A protocol enables secure, asynchronous communication between agents for distributed multi-agent systems.

**A2A features:**
- **Agent discovery**: Find agents by ID or capability
- **Message routing**: Async, persistent message delivery
- **Protocol versioning**: Backward-compatible evolution
- **Trust model**: Cryptographic verification

**A2A usage:**

```typescript
import { a2a } from 'gauss';

const agentA = agent()
  .a2a('agent-a', { endpoint: 'https://api.example.com' })
  .instructions('Send analysis request to agent-b')
  .tools([a2a.send('agent-b')])
  .build();

const agentB = agent()
  .a2a('agent-b', { endpoint: 'https://api.example.com' })
  .subscribe('agent-a', handleRequest)
  .build();
```

A2A enables building distributed, loosely-coupled multi-agent systems.

---

## 15. Persistence

Gauss provides multiple persistence adapters for storing agent state, memory, and data across sessions.

**Supported backends:**
- **PostgreSQL**: Relational data and structured state
- **Redis**: Fast in-memory caching and sessions
- **pgvector**: Vector embeddings and semantic search
- **S3**: Long-term document and artifact storage
- **BullMQ**: Distributed job queues and task persistence

**Persistence setup:**

```typescript
import { persistence } from 'gauss';

const persistenceLayer = persistence()
  .state('postgres', { connectionString: 'postgresql://...' })
  .cache('redis', { url: 'redis://...' })
  .vectors('pgvector', { connectionString: 'postgresql://...' })
  .documents('s3', { bucket: 'my-bucket' })
  .jobs('bullmq', { redis: { url: 'redis://...' } })
  .build();

const agent = agent()
  .model('gpt-4')
  .persistence(persistenceLayer)
  .build();
```

Persistence enables agents to maintain state across sessions and support production workloads.

---

## Putting It All Together

These concepts work together to create powerful, scalable AI systems:

```typescript
import { agent, team, workflow, rag, persistence } from 'gauss';

// Create specialized agents
const researcher = agent()
  .model('gpt-4')
  .instructions('Research and analyze topics')
  .tools([searchTool, analyzeTool])
  .build();

const writer = agent()
  .model('gpt-4')
  .instructions('Write clear, engaging content')
  .tools([formatTool, validateTool])
  .build();

// Coordinate with a team
const contentTeam = team()
  .strategy('pipeline')
  .member('research', researcher)
  .member('writing', writer)
  .build();

// Define workflow
const contentWorkflow = workflow()
  .step(contentTeam)
  .then(reviewAgent)
  .then(publishAgent)
  .build();

// Add persistence
const persistedWorkflow = contentWorkflow
  .persistence(persistence()
    .state('postgres')
    .documents('s3')
    .build())
  .build();
```

This creates a robust system where teams collaborate, workflows coordinate execution, and persistence ensures reliability.

