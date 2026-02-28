---
sidebar_position: 2
title: Adapters (Implementations)
---

# Adapters (Implementations)

Gauss framework provides built-in adapters that implement the [Ports (Interfaces)](./ports.md). Choose and configure adapters based on your application requirements.

## LLM Adapters

### OpenAI

```typescript
import { GaussOpenAI } from 'gauss/providers/openai';

const llm = new GaussOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  temperature: 0.7,
  max_tokens: 2000,
});
```

**Supported Models**: gpt-4o, gpt-4-turbo, gpt-3.5-turbo

**Configuration Options**:
- `apiKey` — OpenAI API key
- `model` — Model identifier (default: gpt-4o)
- `temperature` — Sampling temperature (0-2)
- `max_tokens` — Maximum response tokens
- `top_p` — Nucleus sampling parameter
- `frequency_penalty` — Frequency penalty (-2 to 2)
- `presence_penalty` — Presence penalty (-2 to 2)

### Anthropic

```typescript
import { GaussAnthropic } from 'gauss/providers/anthropic';

const llm = new GaussAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet',
  temperature: 0.5,
});
```

**Supported Models**: claude-3-5-sonnet, claude-3-opus, claude-3-sonnet, claude-3-haiku

**Configuration Options**:
- `apiKey` — Anthropic API key
- `model` — Model identifier
- `temperature` — Sampling temperature (0-1)
- `max_tokens` — Maximum response tokens

### Google (Gemini)

```typescript
import { GaussGoogle } from 'gauss/providers/google';

const llm = new GaussGoogle({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-2.0-flash',
});
```

**Supported Models**: gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash

### Groq

```typescript
import { GaussGroq } from 'gauss/providers/groq';

const llm = new GaussGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'mixtral-8x7b-32768',
});
```

**Supported Models**: mixtral-8x7b-32768, llama2-70b, llama-3.1-70b-versatile

### Ollama

```typescript
import { GaussOllama } from 'gauss/providers/ollama';

const llm = new GaussOllama({
  baseUrl: 'http://localhost:11434',
  model: 'llama2',
});
```

**Supported Models**: llama2, mistral, neural-chat, orca-mini (locally hosted)

**Configuration Options**:
- `baseUrl` — Ollama server URL (default: http://localhost:11434)
- `model` — Model identifier
- `temperature` — Sampling temperature

### OpenRouter

```typescript
import { GaussOpenRouter } from 'gauss/providers/openrouter';

const llm = new GaussOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: 'openai/gpt-4o',
});
```

**Supported Models**: 100+ models from various providers (see [OpenRouter API](https://openrouter.ai/api/v1/models))

## Memory Adapters

### InMemory (Default)

```typescript
import { InMemoryAdapter } from 'gauss/adapters/memory';

const memory = new InMemoryAdapter();

await memory.save(conversationId, {
  id: '1',
  role: 'user',
  content: 'Hello!',
  timestamp: new Date(),
});

const messages = await memory.load(conversationId);
```

**Characteristics**:
- No persistence (cleared on process restart)
- Suitable for development and testing
- Zero configuration

### PostgreSQL

```typescript
import { PostgreSQLAdapter } from 'gauss/adapters/memory/postgresql';

const memory = new PostgreSQLAdapter({
  connectionString: process.env.DATABASE_URL,
  // or individual params:
  host: 'localhost',
  port: 5432,
  database: 'gauss_db',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
});

await memory.save(conversationId, message);
const messages = await memory.load(conversationId, 50);
```

**Required Setup**:
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversation_id ON conversations(conversation_id);
```

## Vector Store Adapters

### pgvector

```typescript
import { PgVectorAdapter } from 'gauss/adapters/vectorstore/pgvector';

const vectorStore = new PgVectorAdapter({
  connectionString: process.env.DATABASE_URL,
  tableName: 'embeddings',
});

await vectorStore.upsert([
  {
    id: 'doc-1',
    embedding: [0.1, 0.2, 0.3, ...],
    metadata: { source: 'document.pdf' },
  },
]);

const results = await vectorStore.query(queryVector, 10);
```

**Required Setup**:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id VARCHAR(255) PRIMARY KEY,
  embedding vector(1536),
  metadata JSONB,
  namespace VARCHAR(255) DEFAULT 'default',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_namespace ON embeddings(namespace);
```

### InMemory Vector Store

```typescript
import { InMemoryVectorStore } from 'gauss/adapters/vectorstore/inmemory';

const vectorStore = new InMemoryVectorStore();

await vectorStore.upsert([
  { id: 'doc-1', embedding: [...], metadata: {...} },
]);

const results = await vectorStore.query(queryVector, 5);
```

**Characteristics**:
- Suitable for development and small datasets
- No external dependencies
- Limited to single process

## Queue Adapters

### BullMQ

```typescript
import { BullMQAdapter } from 'gauss/adapters/queue/bullmq';

const queue = new BullMQAdapter({
  redis: {
    host: 'localhost',
    port: 6379,
  },
});

const taskId = await queue.enqueue('notifications', {
  data: { userId: '123', message: 'Hello!' },
  priority: 1,
});

const task = await queue.dequeue('notifications');
await queue.ack('notifications', taskId);
```

**Configuration Options**:
- `redis` — Redis connection options
- `prefix` — Redis key prefix
- `defaultJobOptions` — Default job configuration

### InMemory Queue

```typescript
import { InMemoryQueue } from 'gauss/adapters/queue/inmemory';

const queue = new InMemoryQueue();

const taskId = await queue.enqueue('tasks', { data: {...} });
const task = await queue.dequeue('tasks');
await queue.ack('tasks', taskId);
```

## Voice Adapters

### OpenAI Whisper (STT + TTS)

```typescript
import { OpenAIVoice } from 'gauss/adapters/voice/openai';

const voice = new OpenAIVoice({
  apiKey: process.env.OPENAI_API_KEY,
});

// Speech-to-text
const text = await voice.transcribe(audioBuffer, 'en');

// Text-to-speech
const audioBuffer = await voice.speak('Hello, world!', 'alloy');
```

**Voices**: alloy, echo, fable, onyx, nova, shimmer

### ElevenLabs (TTS)

```typescript
import { ElevenLabsVoice } from 'gauss/adapters/voice/elevenlabs';

const voice = new ElevenLabsVoice({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voiceId: '21m00Tcm4TlvDq8ikWAM',
});

const audioBuffer = await voice.speak('Hello, world!');
```

**Configuration Options**:
- `apiKey` — ElevenLabs API key
- `voiceId` — Voice identifier
- `stability` — Voice stability (0-1)
- `similarityBoost` — Similarity boost (0-1)

## Cache Adapters

### Redis

```typescript
import { RedisCache } from 'gauss/adapters/cache/redis';

const cache = new RedisCache({
  host: 'localhost',
  port: 6379,
  db: 0,
});

await cache.set('user:123', { name: 'John' }, 3600); // 1 hour TTL
const user = await cache.get('user:123');
await cache.delete('user:123');
await cache.clear();
```

**Configuration Options**:
- `host` — Redis host (default: localhost)
- `port` — Redis port (default: 6379)
- `db` — Database number
- `password` — Redis password
- `prefix` — Key prefix

### InMemory Cache

```typescript
import { InMemoryCache } from 'gauss/adapters/cache/inmemory';

const cache = new InMemoryCache();

await cache.set('key', 'value', 3600);
const value = await cache.get('key');
```

## Filesystem Adapters

### Local (Node.js fs)

```typescript
import { LocalFilesystem } from 'gauss/adapters/filesystem/local';

const fs = new LocalFilesystem({
  basePath: '/app/files',
});

await fs.write('/documents/file.txt', 'content');
const content = await fs.read('/documents/file.txt');
const files = await fs.list('/documents', true);
await fs.delete('/documents/file.txt');
```

**Configuration Options**:
- `basePath` — Base directory for file operations

### AWS S3

```typescript
import { S3Filesystem } from 'gauss/adapters/filesystem/s3';

const fs = new S3Filesystem({
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

await fs.write('/documents/file.txt', 'content');
const content = await fs.read('/documents/file.txt');
const files = await fs.list('/documents', true);
```

**Configuration Options**:
- `bucket` — S3 bucket name
- `region` — AWS region
- `accessKeyId` — AWS access key
- `secretAccessKey` — AWS secret key
- `prefix` — S3 key prefix

## Adapter Selection Guide

| Use Case | Memory | Vector Store | Cache | Filesystem | Queue |
|----------|--------|--------------|-------|-----------|-------|
| **Development** | InMemory | InMemory | InMemory | Local | InMemory |
| **Production (single server)** | PostgreSQL | pgvector | Redis | Local | BullMQ |
| **Production (distributed)** | PostgreSQL | pgvector | Redis | S3 | BullMQ |
| **High-scale** | PostgreSQL | pgvector | Redis | S3 | BullMQ |

