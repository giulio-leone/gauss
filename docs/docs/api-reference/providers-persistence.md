---
sidebar_position: 3
title: Providers & Persistence
---

# Providers & Persistence

## UniversalProvider API

The `UniversalProvider` is a dynamic provider factory that automatically handles model resolution across multiple LLM providers.

### Usage

```typescript
import { universalProvider } from 'gauss/providers';

// Automatically resolve provider from model identifier
const provider = await universalProvider('openai:gpt-5.2');
const response = await provider.generate('Your prompt');

// Or use the factory class
const factory = new UniversalProvider();
const provider = factory.get('anthropic:claude-3-opus');
```

### API Methods

#### `universalProvider(providerId: string): Promise<LLMPort>`

Shorthand function to get a provider instance.

```typescript
const provider = await universalProvider('openai:gpt-5.2');
const response = await provider.generate('Hello!');
```

#### `.get(providerId: string): LLMPort`

Get a provider instance synchronously.

```typescript
const factory = new UniversalProvider();
const provider = factory.get('openai:gpt-5.2');
```

#### `.discoverInstalled(): string[]`

Discover which providers are installed and available.

```typescript
const factory = new UniversalProvider();
const installed = factory.discoverInstalled();
// Returns: ['openai', 'anthropic', 'google', ...]
```

#### `.listKnown(): KnownProvider[]`

List all known providers (installed or not).

```typescript
const factory = new UniversalProvider();
const known = factory.listKnown();
// Returns array of provider metadata
```

### Provider ID Format

Provider identifiers follow the format: `provider:model`

```
openai:gpt-5.2
anthropic:claude-3-opus
google:gemini-2.5-flash-preview-05-20
groq:mixtral-8x7b-32768
ollama:llama2
```

## Known Providers (18+)

### OpenAI
```typescript
const provider = await universalProvider('openai:gpt-5.2');
```
**Models**: gpt-5.2, gpt-4-turbo, gpt-3.5-turbo  
**Env Variable**: `OPENAI_API_KEY`

### Anthropic
```typescript
const provider = await universalProvider('anthropic:claude-3-opus');
```
**Models**: claude-3-opus, claude-3-sonnet, claude-3-haiku, claude-3-5-sonnet  
**Env Variable**: `ANTHROPIC_API_KEY`

### Google (Gemini)
```typescript
const provider = await universalProvider('google:gemini-2.5-flash-preview-05-20');
```
**Models**: gemini-2.5-flash-preview-05-20, gemini-1.5-pro, gemini-1.5-flash  
**Env Variable**: `GOOGLE_API_KEY`

### Mistral
```typescript
const provider = await universalProvider('mistral:mistral-large');
```
**Models**: mistral-large, mistral-medium, mistral-small  
**Env Variable**: `MISTRAL_API_KEY`

### Groq
```typescript
const provider = await universalProvider('groq:mixtral-8x7b-32768');
```
**Models**: mixtral-8x7b-32768, llama2-70b, llama-3.1-70b  
**Env Variable**: `GROQ_API_KEY`

### Ollama
```typescript
const provider = await universalProvider('ollama:llama2');
```
**Models**: llama2, mistral, neural-chat, orca-mini  
**Note**: Requires local Ollama instance running on http://localhost:11434  
**Env Variable**: `OLLAMA_BASE_URL` (optional)

### Azure OpenAI
```typescript
const provider = await universalProvider('azure:gpt-4');
```
**Configuration**: Requires Azure-specific endpoint and key  
**Env Variables**: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`

### Amazon Bedrock
```typescript
const provider = await universalProvider('amazon-bedrock:claude-3-sonnet');
```
**Models**: Anthropic Claude, Cohere Command, Llama 2/3  
**Env Variables**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`

### Cohere
```typescript
const provider = await universalProvider('cohere:command-r-plus');
```
**Models**: command-r-plus, command-r, command  
**Env Variable**: `COHERE_API_KEY`

### Fireworks AI
```typescript
const provider = await universalProvider('fireworks:llama-v2-70b');
```
**Models**: llama-v2-70b, mixtral-8x7b, and more  
**Env Variable**: `FIREWORKS_API_KEY`

### DeepSeek
```typescript
const provider = await universalProvider('deepseek:deepseek-chat');
```
**Models**: deepseek-chat, deepseek-coder  
**Env Variable**: `DEEPSEEK_API_KEY`

### Cerebras
```typescript
const provider = await universalProvider('cerebras:llama-3.3-70b');
```
**Models**: llama-3.3-70b and variants  
**Env Variable**: `CEREBRAS_API_KEY`

### LM Squeeze
```typescript
const provider = await universalProvider('lmsqueezy:lmsqueezy-model');
```
**Env Variable**: `LMSQUEEZY_API_KEY`

### Together AI
```typescript
const provider = await universalProvider('together:meta-llama/Llama-3-70b');
```
**Models**: Various open-source models  
**Env Variable**: `TOGETHER_API_KEY`

### Perplexity
```typescript
const provider = await universalProvider('perplexity:pplx-7b-online');
```
**Models**: pplx-7b-online, pplx-70b-online  
**Env Variable**: `PERPLEXITY_API_KEY`

### xAI
```typescript
const provider = await universalProvider('xai:grok-1');
```
**Models**: grok-1, grok-1-vision  
**Env Variable**: `XAI_API_KEY`

### TogetherAI (Alternative)
```typescript
const provider = await universalProvider('togetherai:meta-llama/Llama-3-70b');
```
**Env Variable**: `TOGETHER_API_KEY`

### OpenRouter
```typescript
const provider = await universalProvider('openrouter:openai/gpt-5.2');
```
**Models**: 100+ models from various providers  
**Env Variable**: `OPENROUTER_API_KEY`

## PostgreSQL Persistence

### Configuration

```typescript
import { PostgreSQLAdapter } from 'gauss/adapters/memory/postgresql';

const memory = new PostgreSQLAdapter({
  // Connection string (recommended for simplicity)
  connectionString: process.env.DATABASE_URL,
  // Or individual parameters
  host: 'localhost',
  port: 5432,
  database: 'gauss_db',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production',
  // Pool configuration
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Schema Setup

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversation_id ON conversations(conversation_id);
CREATE INDEX idx_created_at ON conversations(created_at);
CREATE INDEX idx_metadata ON conversations USING GIN(metadata);
```

### Connection String Examples

```
postgresql://username:password@localhost:5432/gauss_db
postgres://user:pass@db.example.com:5432/mydb?sslmode=require
postgresql://user@localhost/gauss_db
```

## Redis Persistence

### Configuration

```typescript
import { RedisCache } from 'gauss/adapters/cache/redis';

const cache = new RedisCache({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  prefix: 'gauss:',
  retryStrategy: (times) => Math.min(times * 50, 2000),
  enableOfflineQueue: true,
});
```

### Connection String Format

```
redis://[:password@]host[:port][/db]
redis://:mypassword@redis.example.com:6380/1
redis://localhost:6379
```

### Usage with Docker

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

```typescript
// Connect to Docker Redis
const cache = new RedisCache({
  host: 'localhost',
  port: 6379,
});
```

## AWS S3 Configuration

### Setup

```typescript
import { S3Filesystem } from 'gauss/adapters/filesystem/s3';

const fs = new S3Filesystem({
  bucket: process.env.S3_BUCKET_NAME,
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  prefix: 'gauss/', // Optional key prefix
});
```

### Environment Variables

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJal...
S3_BUCKET_NAME=my-gauss-bucket
```

### IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-gauss-bucket",
        "arn:aws:s3:::my-gauss-bucket/*"
      ]
    }
  ]
}
```

## BullMQ Configuration

### Setup

```typescript
import { BullMQAdapter } from 'gauss/adapters/queue/bullmq';

const queue = new BullMQAdapter({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: 1, // Separate DB from cache
  },
  prefix: 'bull:',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
  },
});
```

### Job Configuration

```typescript
const taskId = await queue.enqueue('notifications', {
  data: {
    userId: '123',
    message: 'Hello!',
  },
  priority: 1,
  retries: 3,
  timeout: 30000, // 30 seconds
});
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  app:
    build: .
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      - redis

volumes:
  redis_data:
```

## pgvector Configuration

### Installation

```sql
-- Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE embeddings (
  id VARCHAR(255) PRIMARY KEY,
  embedding vector(1536),
  metadata JSONB,
  namespace VARCHAR(255) DEFAULT 'default',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for performance
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_namespace ON embeddings(namespace);
CREATE INDEX idx_metadata ON embeddings USING GIN(metadata);
```

### Configuration

```typescript
import { PgVectorAdapter } from 'gauss/adapters/vectorstore/pgvector';

const vectorStore = new PgVectorAdapter({
  connectionString: process.env.DATABASE_URL,
  tableName: 'embeddings',
  dimensions: 1536, // OpenAI embedding dimensions
  similarityMetric: 'cosine', // cosine | l2 | inner_product
  timeout: 30000,
});
```

### Usage with Embeddings

```typescript
// Generate embeddings
const embedding = await embedding.embed(['Your text here']);

// Store in pgvector
await vectorStore.upsert([
  {
    id: 'doc-1',
    embedding: embedding[0],
    metadata: { source: 'docs', chunk: 1 },
  },
]);

// Query similar documents
const results = await vectorStore.query(queryEmbedding, k=10, namespace='docs');
```

### Index Configuration

For different dataset sizes, adjust the IVFFlat index lists parameter:

```sql
-- Small datasets (< 100k vectors)
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- Medium datasets (100k - 1M vectors)
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Large datasets (> 1M vectors)
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1000);
```

## Complete Integration Example

```typescript
import { Gauss } from 'gauss';
import { universalProvider } from 'gauss/providers';
import { PostgreSQLAdapter } from 'gauss/adapters/memory/postgresql';
import { PgVectorAdapter } from 'gauss/adapters/vectorstore/pgvector';
import { RedisCache } from 'gauss/adapters/cache/redis';
import { BullMQAdapter } from 'gauss/adapters/queue/bullmq';
import { S3Filesystem } from 'gauss/adapters/filesystem/s3';

const gauss = new Gauss({
  llm: await universalProvider(process.env.LLM_PROVIDER || 'openai:gpt-5.2'),
  memory: new PostgreSQLAdapter({ connectionString: process.env.DATABASE_URL }),
  vectorStore: new PgVectorAdapter({ connectionString: process.env.DATABASE_URL }),
  cache: new RedisCache({ host: process.env.REDIS_HOST }),
  queue: new BullMQAdapter({ redis: { host: process.env.REDIS_HOST } }),
  filesystem: new S3Filesystem({
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
  }),
});

export default gauss;
```

