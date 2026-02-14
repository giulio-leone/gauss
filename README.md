# OneAgent (@onegenui/agent)

> OneAgent — AI Agent Framework built on Vercel AI SDK v6

A hexagonal-architecture agent framework with built-in planning, context management, subagent orchestration, persistent memory, and MCP integration. Agents operate through a tool-loop powered by AI SDK's `ToolLoopAgent`, with filesystem, planning, and subagent tools composed via a fluent builder API.

## Features

- **Builder pattern** -- fluent API with `DeepAgent.create()`, `.minimal()`, and `.full()` factory methods
- **Hexagonal architecture** -- ports and adapters for filesystem, memory, MCP, token counting, and model access
- **Plugin system** -- deterministic middleware lifecycle with hook-based extensions and tool injection
- **Built-in planning** -- structured todo management with dependency tracking and priority
- **Subagent orchestration** -- spawn child agents with configurable depth limits and timeouts
- **Context management** -- automatic rolling summarization, tool-result offloading, and message truncation
- **Human-in-the-loop approval** -- configurable per-tool approval gates with allow/deny lists
- **Checkpointing** -- periodic state snapshots for session resume
- **Event system** -- typed lifecycle events with wildcard subscriptions
- **MCP integration** -- discover and execute tools from any MCP server

## Installation

```bash
pnpm add @onegenui/agent
```

### Peer Dependencies

The package requires `ai` (v6+) and `zod` (v4+) as direct dependencies. The following peer dependencies are optional:

| Package | Purpose |
|---------|---------|
| `@onegenui/mcp` | OneGenUI MCP registry adapter |
| `@onegenui/providers` | AI model provider utilities |
| `@supabase/supabase-js` | Supabase-backed persistent memory |
| `tiktoken` | Accurate BPE token counting |
| `@ai-sdk/mcp` | AI SDK MCP client adapter |

Install only the peers you need:

```bash
pnpm add @supabase/supabase-js tiktoken
```

## Quick Start

```typescript
import { DeepAgent } from "@onegenui/agent";
import { openai } from "@ai-sdk/openai";

const agent = DeepAgent.minimal({
  model: openai("gpt-4o"),
  instructions: "You are a helpful coding assistant.",
});

const result = await agent.run("Create a utility function that debounces input.");

console.log(result.text);
console.log(`Steps: ${result.steps.length}`);
console.log(`Session: ${result.sessionId}`);
```

`DeepAgent.minimal()` creates an agent with a virtual filesystem and planning tools enabled, using in-memory storage and approximate token counting.

## Architecture

```
                          DeepAgent (Orchestrator)
                                  |
            +----------+----------+----------+----------+
            |          |          |          |          |
        EventBus  ApprovalMgr  TokenTracker ContextMgr RollingSummarizer
            |          |          |          |          |
            +----------+----------+----------+----------+
                                  |
                    +-------------+-------------+
                    |             |             |
              FilesystemPort  MemoryPort    McpPort
              ModelPort       TokenCounterPort
                    |             |             |
         +---Adapters---+ +---Adapters---+ +---Adapters---+
         | VirtualFS    | | InMemory     | | AiSdkMcp     |
         | LocalFS      | | Supabase     | | OnegenUiMcp  |
         +------+-------+ +--------------+ +--------------+
                |
          +-----+------+
          |    Tools    |
          | ls, read,  |
          | write, edit|
          | glob, grep |
          | todos, task|
          +------------+
```

### Package Structure

```
src/
  index.ts                    Public API surface
  types.ts                    Shared type definitions
  ports/
    filesystem.port.ts        FilesystemPort interface
    memory.port.ts            MemoryPort interface
    mcp.port.ts               McpPort interface
    model.port.ts             ModelPort interface
    plugin.port.ts            Plugin contracts and lifecycle hooks
    token-counter.port.ts     TokenCounterPort interface
  adapters/
    filesystem/
      virtual-fs.adapter.ts   In-memory VFS with optional disk sync
      local-fs.adapter.ts     Sandboxed Node.js fs wrapper
    memory/
      in-memory.adapter.ts    Map-based in-process storage
      supabase.adapter.ts     Supabase-backed persistent storage
    mcp/
      ai-sdk-mcp.adapter.ts   @ai-sdk/mcp client bridge
      onegenui-mcp.adapter.ts @onegenui/mcp registry bridge
    token-counter/
      approximate.adapter.ts  Character-ratio estimation (~4 chars/token)
      tiktoken.adapter.ts     BPE-accurate counting via tiktoken
  agent/
    deep-agent.ts             DeepAgent class and DeepAgentBuilder
    agent-config.ts           Default configs and resolvers
    approval-manager.ts       Tool-call approval logic
    event-bus.ts              Typed event emitter
    stop-conditions.ts        Reusable stop predicates
  plugins/
    plugin-manager.ts         Plugin lifecycle + deterministic hook execution
    agent-card.plugin.ts      AgentCard generation and serving
    a2a.plugin.ts             A2A integration plugin
    a2a-handler.ts            JSON-RPC A2A request handler
  tools/
    filesystem/               ls, read_file, write_file, edit_file, glob, grep
    planning/                 write_todos, review_todos
    subagent/                 task (spawn child agent)
  context/
    context-manager.ts        Offloading and truncation
    rolling-summarizer.ts     LLM-based conversation compression
    token-tracker.ts          Cumulative usage tracking
  domain/
    todo.schema.ts            Todo Zod schemas
    checkpoint.schema.ts      Checkpoint Zod schemas
    conversation.schema.ts    Message and conversation schemas
    events.schema.ts          Event type schemas
```

## API Reference

### DeepAgent

The main orchestrator class. Use the static factory methods to create instances.

#### Static Factories

##### `DeepAgent.create(config): DeepAgentBuilder`

Returns a builder for full control over agent composition.

```typescript
const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a project manager.",
})
  .withPlanning()
  .withSubagents()
  .withMaxSteps(50)
  .build();
```

##### `DeepAgent.minimal(config): DeepAgent`

Creates an agent with planning enabled, using default adapters (VirtualFilesystem, InMemoryAdapter, ApproximateTokenCounter). Equivalent to `DeepAgent.create(config).withPlanning().build()`.

```typescript
const agent = DeepAgent.minimal({
  model: openai("gpt-4o"),
  instructions: "Complete the task.",
});
```

##### `DeepAgent.full(config): DeepAgent`

Creates a fully-featured agent with planning, subagents, and optional memory/MCP/token counter overrides.

```typescript
import { SupabaseMemoryAdapter } from "@onegenui/agent";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(url, key);

const agent = DeepAgent.full({
  model: openai("gpt-4o"),
  instructions: "You are a senior engineer.",
  memory: new SupabaseMemoryAdapter(supabase),
  mcp: mcpAdapter,
  tokenCounter: tiktokenCounter,
});
```

#### Instance Methods

##### `.run(prompt): Promise<DeepAgentResult>`

Executes the agent loop with the given prompt. Returns when the agent completes or reaches `maxSteps`.

```typescript
interface DeepAgentResult {
  text: string;       // Final assistant response
  steps: unknown[];   // All intermediate steps
  sessionId: string;  // Unique session identifier
}
```

##### `.dispose(): Promise<void>`

Closes MCP connections and removes all event listeners. Call when the agent is no longer needed.

### DeepAgentBuilder

Fluent builder returned by `DeepAgent.create()`.

| Method | Description |
|--------|-------------|
| `.withFilesystem(fs)` | Provide a custom `FilesystemPort` implementation |
| `.withMemory(memory)` | Provide a custom `MemoryPort` implementation |
| `.withTokenCounter(counter)` | Provide a custom `TokenCounterPort` implementation |
| `.withMcp(mcp)` | Provide a `McpPort` for MCP tool integration |
| `.withPlanning()` | Enable planning tools (`write_todos`, `review_todos`) |
| `.withSubagents(config?)` | Enable the `task` tool for spawning subagents |
| `.withApproval(config?)` | Enable human-in-the-loop approval for tool calls |
| `.withMaxSteps(n)` | Override the maximum number of agent loop steps |
| `.use(plugin)` | Register a plugin (hooks + optional tool injection) |
| `.on(event, handler)` | Register an event handler before building |
| `.build()` | Construct the `DeepAgent` instance |

All methods return `this` for chaining. Defaults are applied for any adapter not explicitly provided:

| Adapter | Default |
|---------|---------|
| Filesystem | `VirtualFilesystem` |
| Memory | `InMemoryAdapter` |
| Token Counter | `ApproximateTokenCounter` |
| Max Steps | `30` |

### Plugin System

Plugins are executed in **registration order** and can participate in a deterministic lifecycle:

- `beforeRun` / `afterRun`
- `beforeTool` / `afterTool`
- `beforeStep` / `afterStep`
- `onError`

Plugins can also inject tools by exposing a `tools` map.

```typescript
import type { DeepAgentPlugin } from "@onegenui/agent";

const observabilityPlugin: DeepAgentPlugin = {
  name: "observability",
  hooks: {
    beforeRun: async (_ctx, params) => ({
      prompt: `[trace] ${params.prompt}`,
    }),
    afterRun: async (_ctx, params) => {
      console.log("Final output length:", params.result.text.length);
    },
  },
};

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a release engineer.",
})
  .use(observabilityPlugin)
  .build();
```

#### Built-in Plugins

| Plugin | Description |
|--------|-------------|
| `AgentCardPlugin` | Resolves `agents.md` / `skills.md` with priority `manual file > override > auto-generated` |
| `A2APlugin` | Exposes an A2A JSON-RPC handler and adds the `a2a:call` tool for remote A2A agents |

`A2APlugin` can consume `AgentCardPlugin` as a discovery provider:

```typescript
import {
  DeepAgent,
  AgentCardPlugin,
  A2APlugin,
} from "@onegenui/agent";

const agentCard = new AgentCardPlugin();
const a2a = new A2APlugin({ agentCardProvider: agentCard });

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "Coordinate infra operations across distributed agents.",
})
  .use(agentCard)
  .use(a2a)
  .build();

const a2aHttpHandler = a2a.createHttpHandler(agent);
```

### Tools

Tools are automatically registered based on builder configuration.

#### Filesystem Tools

Always included. Created via `createFilesystemTools(fs)`.

| Tool | Description |
|------|-------------|
| `ls` | List directory contents |
| `read_file` | Read file content as string |
| `write_file` | Write content to a file, creating directories as needed |
| `edit_file` | Apply targeted string replacements to a file |
| `glob` | Find files matching a glob pattern |
| `grep` | Search file contents by regex pattern |

Individual tool factories are also exported: `createLsTool`, `createReadFileTool`, `createWriteFileTool`, `createEditFileTool`, `createGlobTool`, `createGrepTool`.

#### Planning Tools

Enabled via `.withPlanning()`. Created via `createPlanningTools(fs)`.

| Tool | Description |
|------|-------------|
| `write_todos` | Create or update a structured list of todos |
| `review_todos` | Review current todo status and dependencies |

Todos are stored as JSON in the persistent filesystem zone. Each todo has an `id`, `title`, `description`, `status` (pending/in_progress/done/blocked), `dependencies`, and `priority` (low/medium/high/critical).

#### Subagent Tool

Enabled via `.withSubagents(config?)`. Created via `createSubagentTools(config)`.

| Tool | Description |
|------|-------------|
| `task` | Spawn a child `ToolLoopAgent` with its own filesystem tools to handle a subtask |

The subagent receives a prompt and optional instructions, runs with its own step limit, and returns its findings to the parent agent.

```typescript
interface TaskToolConfig {
  parentModel: LanguageModel;
  parentFilesystem: FilesystemPort;
  maxDepth?: number;      // Default: 3
  timeoutMs?: number;     // Default: 300000 (5 min)
  currentDepth?: number;
}
```

### Ports

Port interfaces define the contracts for hexagonal architecture. Implement these to provide custom adapters.

#### ModelPort

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

#### FilesystemPort

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

#### MemoryPort

Persistent state storage for todos, checkpoints, conversations, and arbitrary metadata.

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

#### McpPort

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

MCP tools are registered with a `mcp:` namespace prefix (e.g., `mcp:web_search`).

#### TokenCounterPort

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

### Adapters

#### Filesystem

| Adapter | Description |
|---------|-------------|
| `VirtualFilesystem` | In-memory filesystem with optional disk persistence via `syncToPersistent()`. Supports transient and persistent zones. Default adapter. |
| `LocalFilesystem` | Sandboxed wrapper over Node.js `fs`. Restricts operations to a configured base path. |

#### Memory

| Adapter | Description |
|---------|-------------|
| `InMemoryAdapter` | `Map`-based in-process storage. Suitable for testing and ephemeral sessions. Default adapter. |
| `SupabaseMemoryAdapter` | Supabase-backed storage using `deep_agent_todos`, `deep_agent_checkpoints`, `deep_agent_conversations`, and `deep_agent_metadata` tables. |

#### Token Counter

| Adapter | Description |
|---------|-------------|
| `ApproximateTokenCounter` | Fast estimation using ~4 characters per token. Includes context window sizes for common models. Default adapter. |
| `TiktokenTokenCounter` | BPE-accurate counting via the `tiktoken` library. Falls back to `ApproximateTokenCounter` when tiktoken is unavailable. |

#### MCP

| Adapter | Description |
|---------|-------------|
| `AiSdkMcpAdapter` | Bridges `@ai-sdk/mcp` clients to the `McpPort` interface. Supports stdio, HTTP, and SSE transports. |
| `OnegenUiMcpAdapter` | Bridges `@onegenui/mcp` `McpRegistry` to the `McpPort` interface. |

### Events

Subscribe to lifecycle events via the builder's `.on()` method or directly on `agent.eventBus`.

```typescript
const agent = DeepAgent.create(config)
  .withPlanning()
  .on("tool:call", (event) => {
    console.log(`Tool called: ${event.data.toolName}`);
  })
  .on("*", (event) => {
    // Wildcard: receives all events
  })
  .build();
```

Every event has the shape:

```typescript
interface AgentEvent<T = unknown> {
  type: AgentEventType;
  timestamp: number;
  sessionId: string;
  data: T;
}
```

#### Event Types

| Event | Description |
|-------|-------------|
| `agent:start` | Agent run begins |
| `agent:stop` | Agent run completes |
| `step:start` | A step in the tool loop begins |
| `step:end` | A step in the tool loop ends |
| `tool:call` | A tool is invoked |
| `tool:result` | A tool returns a result |
| `tool:approval-required` | A tool call requires human approval |
| `tool:approved` | A tool call was approved |
| `tool:denied` | A tool call was denied |
| `checkpoint:save` | A checkpoint was persisted |
| `checkpoint:load` | A checkpoint was restored |
| `context:summarize` | Conversation was summarized to reduce tokens |
| `context:offload` | A large tool result was offloaded to the VFS |
| `context:truncate` | Messages were truncated to fit the context window |
| `subagent:spawn` | A subagent was spawned via the `task` tool |
| `subagent:complete` | A subagent finished execution |
| `planning:update` | The todo list was updated |
| `error` | An error occurred during execution |

### Context Management

The framework automatically manages the LLM context window through three mechanisms:

#### Tool-Result Offloading

When a tool result exceeds `offloadTokenThreshold` (default: 20,000 tokens), the `ContextManager` writes it to the transient VFS zone and replaces the inline result with a file reference. The agent can read the full content via `read_file` when needed.

#### Rolling Summarization

When conversation messages exceed `summarizationThreshold` (default: 70% of context window), the `RollingSummarizer` compresses older messages into a summary using a dedicated LLM call. Recent messages (configurable via `preserveRecentMessages`, default: 10) are always preserved.

#### Message Truncation

When messages exceed `truncationThreshold` (default: 85% of context window), the `ContextManager` drops the oldest non-system messages to fit within budget. System messages are always preserved.

#### Token Tracking

The `TokenTracker` accumulates input and output token usage across the session, providing budget awareness and cost estimation.

## Examples

- `examples/01-basic-agent.ts` — minimal planning agent
- `examples/02-planning-agent.ts` — structured todo workflow
- `examples/03-subagent-orchestration.ts` — parent/child delegation
- `examples/04-mcp-integration.ts` — MCP tool federation
- `examples/05-persistent-memory.ts` — persistent session state
- `examples/06-full-featured.ts` — full stack composition
- `examples/07-plugin-system.ts` — custom plugin + AgentCardPlugin
- `examples/08-a2a-server.ts` — expose DeepAgent as A2A JSON-RPC server

### Basic Planning Agent

```typescript
import { DeepAgent } from "@onegenui/agent";
import { openai } from "@ai-sdk/openai";

const agent = DeepAgent.minimal({
  model: openai("gpt-4o"),
  instructions: `You are a project planner. Break tasks into todos,
    then work through them systematically.`,
  maxSteps: 50,
});

const result = await agent.run(
  "Set up a REST API with user authentication endpoints."
);
```

### Agent with MCP Tools

```typescript
import { DeepAgent, AiSdkMcpAdapter } from "@onegenui/agent";
import { openai } from "@ai-sdk/openai";

const mcp = new AiSdkMcpAdapter({
  servers: [
    {
      id: "web-search",
      name: "Web Search",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@anthropic/web-search-mcp"],
    },
  ],
});

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You can search the web to answer questions.",
})
  .withMcp(mcp)
  .withPlanning()
  .build();

const result = await agent.run("Research the latest Node.js release.");
await agent.dispose();
```

### Full-Featured Agent with Persistence

```typescript
import {
  DeepAgent,
  SupabaseMemoryAdapter,
  LocalFilesystem,
  TiktokenTokenCounter,
} from "@onegenui/agent";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a senior engineer working on a codebase.",
  maxSteps: 100,
  context: {
    summarizationThreshold: 0.65,
    offloadTokenThreshold: 15_000,
  },
  checkpoint: {
    enabled: true,
    baseStepInterval: 10,
    maxCheckpoints: 5,
  },
})
  .withFilesystem(new LocalFilesystem("/path/to/project"))
  .withMemory(new SupabaseMemoryAdapter(supabase))
  .withTokenCounter(new TiktokenTokenCounter())
  .withPlanning()
  .withSubagents({ maxDepth: 2, timeoutMs: 120_000 })
  .withApproval({
    defaultMode: "approve-all",
    requireApproval: ["write_file", "edit_file"],
    onApprovalRequired: async (request) => {
      console.log(`Approve ${request.toolName}?`, request.args);
      return true; // Replace with actual UI prompt
    },
  })
  .on("agent:start", (e) => console.log("Agent started"))
  .on("error", (e) => console.error("Error:", e.data))
  .build();

const result = await agent.run("Refactor the auth module to use JWT.");
await agent.dispose();
```

## Configuration

### DeepAgentConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | `crypto.randomUUID()` | Agent/session identifier |
| `name` | `string` | -- | Display name |
| `instructions` | `string` | **(required)** | System prompt |
| `model` | `LanguageModel` | **(required)** | AI SDK model instance |
| `maxSteps` | `number` | `30` | Maximum tool-loop iterations |
| `context` | `ContextConfig` | See below | Context window management |
| `approval` | `ApprovalConfig` | See below | Human-in-the-loop settings |
| `subagent` | `SubagentConfig` | See below | Subagent orchestration settings |
| `checkpoint` | `CheckpointConfig` | See below | Checkpoint/resume settings |

### ContextConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `summarizationThreshold` | `number` | `0.70` | Context ratio to trigger summarization |
| `truncationThreshold` | `number` | `0.85` | Context ratio to trigger truncation |
| `offloadTokenThreshold` | `number` | `20000` | Token count to trigger VFS offload |
| `summarizationModel` | `LanguageModel \| null` | `null` (uses agent model) | Model for summarization calls |
| `preserveRecentMessages` | `number` | `10` | Messages to keep during summarization |

### ApprovalConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `defaultMode` | `"approve-all" \| "deny-all"` | `"approve-all"` | Default approval policy |
| `requireApproval` | `string[]` | `[]` | Tools requiring approval (deny-list) |
| `autoApprove` | `string[]` | `[]` | Auto-approved tools (allow-list) |
| `onApprovalRequired` | `(req) => Promise<boolean>` | `async () => true` | Approval callback |

### SubagentConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `maxDepth` | `number` | `3` | Maximum nesting depth |
| `timeoutMs` | `number` | `300000` | Execution timeout (ms) |
| `allowNesting` | `boolean` | `true` | Whether subagents can spawn subagents |

### CheckpointConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable checkpointing |
| `baseStepInterval` | `number` | `5` | Steps between checkpoints |
| `maxCheckpoints` | `number` | `10` | Maximum retained checkpoints |

## Multi-Runtime Support

The framework runs on **Node.js**, **Deno**, **Bun**, **Edge** (Cloudflare Workers, Vercel Edge), and **Browser** runtimes. The core API (`DeepAgent`, `VirtualFilesystem`, `InMemoryAdapter`) is runtime-agnostic; platform-specific adapters live in dedicated sub-path exports.

### Installation per Runtime

```ts
// Node.js / Bun — core + Node-specific adapters
import { DeepAgent } from '@onegenui/agent';
import { LocalFilesystem, TiktokenTokenCounter } from '@onegenui/agent/node';

// Deno — Deno.Kv memory, Deno filesystem
import { DenoFilesystem, DenoKvMemoryAdapter } from '@onegenui/agent/deno';

// Edge / Cloudflare Workers — OPFS filesystem, IndexedDB memory
import { OpfsFilesystem, IndexedDbMemoryAdapter } from '@onegenui/agent/edge';

// Browser — same adapters as Edge (OPFS + IndexedDB)
import { OpfsFilesystem, IndexedDbMemoryAdapter } from '@onegenui/agent/browser';
```

### Auto-Configuration

`DeepAgent.auto()` creates an agent using universal adapters (`VirtualFilesystem`, `InMemoryAdapter`, `ApproximateTokenCounter`) that work in any runtime — no platform-specific imports required.

```ts
import { DeepAgent } from '@onegenui/agent';
import { openai } from '@ai-sdk/openai';

const agent = DeepAgent.auto({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.',
});

const result = await agent.run('Summarize the project.');
```

For runtime-specific adapters (e.g. `LocalFilesystem`, `DenoKvMemoryAdapter`), use `DeepAgent.create()` and compose manually.

### MCP Server Mode

Expose agent tools as an MCP-compatible HTTP server for cross-language consumption:

```ts
import { DeepAgent } from '@onegenui/agent';
import { McpServer, createStreamableHttpHandler } from '@onegenui/agent/server';
import { openai } from '@ai-sdk/openai';

const agent = DeepAgent.minimal({
  model: openai('gpt-4o'),
  instructions: 'You are a coding assistant.',
});

const server = new McpServer({
  name: 'my-agent',
  version: '1.0.0',
  tools: agent.tools,
});

const handler = createStreamableHttpHandler({ server });

// Node.js / Bun — serve with any HTTP framework
const httpServer = Bun.serve({ port: 3000, fetch: handler });
// Or with Node.js:
// import { createServer } from 'node:http';
// createServer(async (req, res) => { ... }).listen(3000);
```

### Cross-Language Consumption

Any language that speaks HTTP + JSON-RPC can consume agent tools via the MCP Streamable HTTP transport. Initialize a session, list available tools, call them, and close the session — all with standard HTTP requests.

See [`examples/python-mcp-client/`](./examples/python-mcp-client/) for a working Python client.

## Multi-Agent Collaboration

Orchestrate multiple agents using a declarative graph API with DAG execution, parallel forking, and consensus:

```ts
import { AgentGraph, LlmJudgeConsensus } from '@onegenui/agent';
import { openai } from '@ai-sdk/openai';

const model = openai('gpt-4o');

const graph = AgentGraph.create({ maxConcurrency: 3 })
  .node('research', { model, instructions: 'Research the topic thoroughly.' })
  .node('code', { model, instructions: 'Write clean, tested code.' })
  .node('test', { model, instructions: 'Write comprehensive tests.' })
  .edge('research', 'code')
  .edge('code', 'test')
  .fork('review', [
    { model, instructions: 'Review for correctness and bugs.' },
    { model, instructions: 'Review for performance and style.' },
    { model, instructions: 'Review for security vulnerabilities.' },
  ])
  .consensus('review', new LlmJudgeConsensus({ model }))
  .edge('test', 'review')
  .build();

const result = await graph.run('Build a REST API with JWT auth.');
console.log(result.output);
console.log(result.nodeResults); // Per-node results
```

## Real-Time Event Streaming

Stream agent events via SSE for real-time monitoring:

```ts
import { DeepAgent, createSseHandler } from '@onegenui/agent';
import { openai } from '@ai-sdk/openai';

const agent = DeepAgent.minimal({ model: openai('gpt-4o'), instructions: '...' });
const handler = createSseHandler({ eventBus: agent.eventBus });

// Serve with any runtime (Node.js, Deno, Bun, Cloudflare Workers)
Bun.serve({ port: 3001, fetch: handler });
```

Client-side with native EventSource:

```js
const source = new EventSource('http://localhost:3001?filter=tool:call,step:end');
source.addEventListener('tool:call', (e) => console.log(JSON.parse(e.data)));
```

## License

MIT
