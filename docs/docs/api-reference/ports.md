---
sidebar_position: 1
title: Ports (Interfaces)
---

# Ports (Interfaces)

Gauss framework uses **ports** as pluggable interfaces that define contracts for various system capabilities. Each port is technology-agnostic and can have multiple adapter implementations.

## LLMPort

Interface for language model interactions.

```typescript
interface LLMPort {
  /**
   * Generate a completion from an LLM.
   * @param prompt - The input prompt or messages
   * @param options - Generation options (temperature, max_tokens, etc.)
   * @returns Promise resolving to an LLM response
   */
  generate(
    prompt: string | Message[],
    options?: GenerateOptions
  ): Promise<LLMResponse>;
}

interface LLMResponse {
  /** The generated text content */
  content: string;
  /** Usage statistics (prompt_tokens, completion_tokens, total_tokens) */
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Model identifier that was used */
  model: string;
  /** Optional stop reason */
  stop_reason?: string;
}

interface GenerateOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}
```

## MemoryPort

Interface for managing conversation history and context persistence.

```typescript
interface MemoryPort {
  /**
   * Save a message to conversation history.
   * @param conversationId - Unique conversation identifier
   * @param message - Message to save
   * @returns Promise resolving when saved
   */
  save(
    conversationId: string,
    message: Message
  ): Promise<void>;

  /**
   * Load messages from conversation history.
   * @param conversationId - Unique conversation identifier
   * @param limit - Maximum messages to retrieve (default: 50)
   * @returns Promise resolving to array of messages
   */
  load(
    conversationId: string,
    limit?: number
  ): Promise<Message[]>;

  /**
   * Search messages in conversation history.
   * @param conversationId - Unique conversation identifier
   * @param query - Search query
   * @returns Promise resolving to matching messages
   */
  search(
    conversationId: string,
    query: string
  ): Promise<Message[]>;

  /**
   * Delete a specific message.
   * @param conversationId - Unique conversation identifier
   * @param messageId - ID of message to delete
   * @returns Promise resolving when deleted
   */
  delete(
    conversationId: string,
    messageId: string
  ): Promise<void>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}
```

## VectorStorePort

Interface for storing and querying vector embeddings.

```typescript
interface VectorStorePort {
  /**
   * Upsert (insert or update) vectors into the store.
   * @param vectors - Array of vectors with ids and embeddings
   * @param namespace - Optional namespace/collection for organization
   * @returns Promise resolving when upserted
   */
  upsert(
    vectors: Vector[],
    namespace?: string
  ): Promise<void>;

  /**
   * Query vectors by similarity.
   * @param query - Query vector or embedding
   * @param k - Number of top results to return
   * @param namespace - Optional namespace to search in
   * @returns Promise resolving to similar vectors with scores
   */
  query(
    query: number[],
    k: number,
    namespace?: string
  ): Promise<QueryResult[]>;

  /**
   * Delete vectors by id.
   * @param ids - Vector IDs to delete
   * @param namespace - Optional namespace
   * @returns Promise resolving when deleted
   */
  delete(
    ids: string[],
    namespace?: string
  ): Promise<void>;
}

interface Vector {
  id: string;
  embedding: number[];
  metadata?: Record<string, any>;
}

interface QueryResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}
```

## EmbeddingPort

Interface for generating text embeddings.

```typescript
interface EmbeddingPort {
  /**
   * Generate embeddings for one or more texts.
   * @param texts - Array of texts to embed
   * @returns Promise resolving to 2D array of embeddings
   */
  embed(texts: string[]): Promise<number[][]>;
}
```

## FilesystemPort

Interface for file system operations.

```typescript
interface FilesystemPort {
  /**
   * Read file contents.
   * @param path - File path
   * @param encoding - File encoding (default: utf-8)
   * @returns Promise resolving to file contents
   */
  read(
    path: string,
    encoding?: string
  ): Promise<string | Buffer>;

  /**
   * Write contents to a file.
   * @param path - File path
   * @param contents - File contents
   * @param encoding - File encoding (default: utf-8)
   * @returns Promise resolving when written
   */
  write(
    path: string,
    contents: string | Buffer,
    encoding?: string
  ): Promise<void>;

  /**
   * List files in a directory.
   * @param path - Directory path
   * @param recursive - Whether to list recursively
   * @returns Promise resolving to file paths
   */
  list(
    path: string,
    recursive?: boolean
  ): Promise<string[]>;

  /**
   * Delete a file.
   * @param path - File path
   * @returns Promise resolving when deleted
   */
  delete(path: string): Promise<void>;
}
```

## QueuePort

Interface for task queuing and processing.

```typescript
interface QueuePort {
  /**
   * Enqueue a task.
   * @param queueName - Queue identifier
   * @param task - Task to enqueue
   * @returns Promise resolving to task ID
   */
  enqueue(
    queueName: string,
    task: QueuedTask
  ): Promise<string>;

  /**
   * Dequeue a task for processing.
   * @param queueName - Queue identifier
   * @returns Promise resolving to next task or null
   */
  dequeue(queueName: string): Promise<QueuedTask | null>;

  /**
   * Acknowledge (mark as completed) a task.
   * @param queueName - Queue identifier
   * @param taskId - Task ID to acknowledge
   * @returns Promise resolving when acknowledged
   */
  ack(
    queueName: string,
    taskId: string
  ): Promise<void>;
}

interface QueuedTask {
  id: string;
  data: Record<string, any>;
  priority?: number;
  retries?: number;
}
```

## VoicePort

Interface for speech-to-text and text-to-speech operations.

```typescript
interface VoicePort {
  /**
   * Transcribe audio to text.
   * @param audio - Audio buffer or file path
   * @param language - Optional language code (e.g., 'en', 'es')
   * @returns Promise resolving to transcribed text
   */
  transcribe(
    audio: Buffer | string,
    language?: string
  ): Promise<string>;

  /**
   * Generate speech from text.
   * @param text - Text to synthesize
   * @param voice - Voice identifier
   * @returns Promise resolving to audio buffer
   */
  speak(
    text: string,
    voice?: string
  ): Promise<Buffer>;
}
```

## FrameExtractorPort

Interface for extracting frames from video/image sources.

```typescript
interface FrameExtractorPort {
  /**
   * Extract frames from a video or image source.
   * @param source - Video file path, URL, or stream
   * @param options - Extraction options
   * @returns Promise resolving to array of frames
   */
  extractFrames(
    source: string | Buffer,
    options?: FrameExtractionOptions
  ): Promise<Frame[]>;
}

interface Frame {
  data: Buffer;
  timestamp: number;
  format: 'png' | 'jpeg';
}

interface FrameExtractionOptions {
  interval?: number;
  maxFrames?: number;
  width?: number;
  height?: number;
}
```

## CachePort

Interface for caching operations.

```typescript
interface CachePort {
  /**
   * Get a value from cache.
   * @param key - Cache key
   * @returns Promise resolving to cached value or null
   */
  get(key: string): Promise<any | null>;

  /**
   * Set a value in cache.
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in seconds (optional)
   * @returns Promise resolving when set
   */
  set(
    key: string,
    value: any,
    ttl?: number
  ): Promise<void>;

  /**
   * Delete a cache entry.
   * @param key - Cache key
   * @returns Promise resolving when deleted
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all cache entries.
   * @returns Promise resolving when cleared
   */
  clear(): Promise<void>;
}
```

## TelemetryPort

Interface for observability (tracing, metrics, logging).

```typescript
interface TelemetryPort {
  /**
   * Start a distributed trace span.
   * @param name - Span name
   * @param attributes - Optional span attributes
   * @returns Span object for tracking
   */
  span(
    name: string,
    attributes?: Record<string, any>
  ): Span;

  /**
   * Record an event.
   * @param name - Event name
   * @param attributes - Event attributes
   * @returns Promise resolving when recorded
   */
  event(
    name: string,
    attributes?: Record<string, any>
  ): Promise<void>;

  /**
   * Flush pending telemetry data.
   * @returns Promise resolving when flushed
   */
  flush(): Promise<void>;
}

interface Span {
  addAttribute(key: string, value: any): void;
  addEvent(name: string, attributes?: Record<string, any>): void;
  end(): void;
}
```

## Summary

| Port | Purpose | Key Methods |
|------|---------|------------|
| **LLMPort** | Language model interactions | `generate()` |
| **MemoryPort** | Conversation history | `save()`, `load()`, `search()`, `delete()` |
| **VectorStorePort** | Vector similarity search | `upsert()`, `query()`, `delete()` |
| **EmbeddingPort** | Text embeddings | `embed()` |
| **FilesystemPort** | File operations | `read()`, `write()`, `list()`, `delete()` |
| **QueuePort** | Task queuing | `enqueue()`, `dequeue()`, `ack()` |
| **VoicePort** | Speech processing | `transcribe()`, `speak()` |
| **FrameExtractorPort** | Video frame extraction | `extractFrames()` |
| **CachePort** | Data caching | `get()`, `set()`, `delete()`, `clear()` |
| **TelemetryPort** | Observability | `span()`, `event()`, `flush()` |

