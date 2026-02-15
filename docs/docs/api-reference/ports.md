---
sidebar_position: 6
title: Port Interfaces
description: Complete reference for all GaussFlow port interfaces
---

# Port Interfaces

Ports define the contracts for GaussFlow's hexagonal architecture. Implement any port to provide a custom adapter.

## FilesystemPort

File operations with zone-based isolation (`transient` or `persistent`).

```typescript
interface FilesystemPort {
  read(path: string, zone?: FilesystemZone): Promise<string>;
  write(path: string, content: string, zone?: FilesystemZone): Promise<void>;
  exists(path: string, zone?: FilesystemZone): Promise<boolean>;
  delete(path: string, zone?: FilesystemZone): Promise<void>;
  list(path: string, options?: ListOptions, zone?: FilesystemZone): Promise<FileEntry[]>;
  search(pattern: string, options?: SearchOptions, zone?: FilesystemZone): Promise<SearchResult[]>;
  glob(pattern: string, zone?: FilesystemZone): Promise<string[]>;
  stat(path: string, zone?: FilesystemZone): Promise<FileStat>;
  syncToPersistent?(): Promise<void>;
  clearTransient?(): Promise<void>;
}
```

## MemoryPort

Persistent state storage for todos, checkpoints, conversations, and metadata.

```typescript
interface MemoryPort {
  saveTodos(sessionId: string, todos: Todo[]): Promise<void>;
  loadTodos(sessionId: string): Promise<Todo[]>;
  saveCheckpoint(sessionId: string, checkpoint: Checkpoint): Promise<void>;
  loadLatestCheckpoint(sessionId: string): Promise<Checkpoint | null>;
  listCheckpoints(sessionId: string): Promise<Checkpoint[]>;
  deleteOldCheckpoints(sessionId: string, keepCount: number): Promise<void>;
  saveConversation(sessionId: string, messages: Message[]): Promise<void>;
  loadConversation(sessionId: string): Promise<Message[]>;
  saveMetadata(sessionId: string, key: string, value: unknown): Promise<void>;
  loadMetadata<T>(sessionId: string, key: string): Promise<T | null>;
  deleteMetadata(sessionId: string, key: string): Promise<void>;
}
```

## ModelPort

LLM invocation abstraction.

```typescript
interface ModelPort {
  getModel(): LanguageModel;
  getContextWindowSize(): number;
  getModelId(): string;
  generate(options: ModelGenerateOptions): Promise<ModelGenerateResult>;
  generateStream?(options: ModelGenerateOptions): Promise<ModelStreamResult>;
}
```

## RuntimePort

Platform-agnostic runtime APIs.

```typescript
interface RuntimePort {
  randomUUID(): string;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  getEnv(key: string): string | undefined;
  setTimeout(callback: () => void, ms: number): { clear(): void };
}
```

## McpPort

MCP server discovery and tool execution.

```typescript
interface McpPort {
  discoverTools(): Promise<Record<string, McpToolDefinition>>;
  executeTool(name: string, args: unknown): Promise<McpToolResult>;
  listServers(): Promise<McpServerInfo[]>;
  connect(config: McpServerConfig): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  closeAll(): Promise<void>;
}
```

## TokenCounterPort

Token counting, budgeting, and cost estimation.

```typescript
interface TokenCounterPort {
  count(text: string, model?: string): number;
  countMessages(messages: Message[], model?: string): number;
  getContextWindowSize(model: string): number;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
  truncate(text: string, maxTokens: number, model?: string): string;
}
```

## LearningPort

Cross-session learning with user profiles, memories, and shared knowledge.

```typescript
interface LearningPort {
  getProfile(userId: string): Promise<UserProfile | null>;
  updateProfile(userId: string, updates: Partial<Omit<UserProfile, "userId" | "createdAt">>): Promise<UserProfile>;
  deleteProfile(userId: string): Promise<void>;
  addMemory(userId: string, memory: Omit<UserMemoryInput, "id" | "createdAt">): Promise<UserMemory>;
  getMemories(userId: string, options?: { tags?: string[]; limit?: number; since?: number }): Promise<UserMemory[]>;
  deleteMemory(userId: string, memoryId: string): Promise<void>;
  clearMemories(userId: string): Promise<void>;
  addKnowledge(knowledge: Omit<SharedKnowledgeInput, "id" | "createdAt" | "usageCount">): Promise<SharedKnowledge>;
  queryKnowledge(query: string, options?: { category?: string; limit?: number }): Promise<SharedKnowledge[]>;
  incrementKnowledgeUsage(knowledgeId: string): Promise<void>;
  deleteKnowledge(knowledgeId: string): Promise<void>;
}
```

## ValidationPort

Engine-agnostic validation contract.

```typescript
interface ValidationPort {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T>;
  validateOrThrow<T>(schema: unknown, data: unknown): T;
}

interface ValidationResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}
```

## TracingPort

Distributed tracing contract.

```typescript
interface TracingPort {
  startSpan(name: string, parentSpan?: Span): Span;
}

interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly name: string;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: "ok" | "error", message?: string): void;
  end(): void;
}
```

## MetricsPort

Metrics collection contract.

```typescript
interface MetricsPort {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  recordGauge(name: string, value: number, labels?: Record<string, string>): void;
}
```

## LoggingPort

Structured logging contract.

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggingPort {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
}
```

## ConsensusPort

Strategy for evaluating fork results in AgentGraph.

```typescript
interface ConsensusPort {
  evaluate(results: Array<{ id: string; output: string }>): Promise<ConsensusResult>;
}

interface ConsensusResult {
  winnerId: string;
  winnerOutput: string;
  scores?: Record<string, number>;
  merged?: string;
  reasoning?: string;
}
```

## PluginPort

Plugin contracts and lifecycle hooks.

```typescript
interface DeepAgentPlugin {
  readonly name: string;
  readonly version?: string;
  readonly hooks?: PluginHooks;
  readonly tools?: Record<string, Tool>;
  setup?(ctx: PluginSetupContext): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

interface PluginHooks {
  beforeRun?(ctx: PluginContext, params: BeforeRunParams): Promise<BeforeRunResult | void>;
  afterRun?(ctx: PluginContext, params: AfterRunParams): Promise<void>;
  beforeTool?(ctx: PluginContext, params: BeforeToolParams): Promise<BeforeToolResult | void>;
  afterTool?(ctx: PluginContext, params: AfterToolParams): Promise<void>;
  beforeStep?(ctx: PluginContext, params: BeforeStepParams): Promise<BeforeStepResult | void>;
  afterStep?(ctx: PluginContext, params: AfterStepParams): Promise<void>;
  onError?(ctx: PluginContext, params: OnErrorParams): Promise<OnErrorResult | void>;
}

interface PluginContext {
  readonly sessionId: string;
  readonly agentName?: string;
  readonly config: Readonly<{ instructions: string; maxSteps: number }>;
  readonly filesystem: FilesystemPort;
  readonly memory: MemoryPort;
  readonly learning?: LearningPort;
  readonly toolNames: readonly string[];
  readonly runMetadata?: PluginRunMetadata;
}
```
